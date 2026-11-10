from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, time, timedelta

from django.db.models import Count, Max, Min, Q
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import PatientProfile, ProfessionalProfile
from apps.appointments.models import Appointment

STATUS_LABELS = dict(Appointment.Status.choices)
STATUS_CODES = [choice[0] for choice in Appointment.Status.choices]
PERIOD_START_PARAMS = ("start_date", "date_from", "from")
PERIOD_END_PARAMS = ("end_date", "date_to", "to")


@dataclass(frozen=True)
class ReportPeriod:
    start_date: object = None
    end_date: object = None
    start_at: object = None
    end_before: object = None

    def as_dict(self):
        return {
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
        }


def parse_report_period(query_params):
    start_date = _parse_date_param(query_params, PERIOD_START_PARAMS)
    end_date = _parse_date_param(query_params, PERIOD_END_PARAMS)

    if start_date and end_date and start_date > end_date:
        raise ValidationError(
            {"period": "start_date deve ser menor ou igual a end_date."}
        )

    current_timezone = timezone.get_current_timezone()
    start_at = None
    end_before = None

    if start_date:
        start_at = timezone.make_aware(
            datetime.combine(start_date, time.min),
            current_timezone,
        )

    if end_date:
        end_before = timezone.make_aware(
            datetime.combine(end_date + timedelta(days=1), time.min),
            current_timezone,
        )

    return ReportPeriod(
        start_date=start_date,
        end_date=end_date,
        start_at=start_at,
        end_before=end_before,
    )


def _parse_date_param(query_params, names):
    raw_value = None
    field_name = names[0]

    for name in names:
        value = query_params.get(name)
        if value:
            raw_value = value
            field_name = name
            break

    if not raw_value:
        return None

    parsed = parse_date(raw_value)
    if parsed is None:
        raise ValidationError({field_name: "Use o formato YYYY-MM-DD."})

    return parsed


def apply_period(queryset, period):
    if period.start_at:
        queryset = queryset.filter(scheduled_at__gte=period.start_at)

    if period.end_before:
        queryset = queryset.filter(scheduled_at__lt=period.end_before)

    return queryset


def appointment_queryset():
    return Appointment.objects.select_related(
        "patient__user",
        "professional__user",
        "clinic",
    )


def resolve_patient_for_user(user, patient_id):
    queryset = PatientProfile.objects.select_related("user", "user__clinic")

    if user.is_superuser:
        return get_object_or_404(queryset, pk=patient_id)

    if not user.clinic_id:
        raise PermissionDenied("Usuario sem clinica vinculada.")

    patient = get_object_or_404(
        queryset.filter(user__clinic_id=user.clinic_id),
        pk=patient_id,
    )

    if user.is_patient:
        if patient.user_id != user.id:
            raise PermissionDenied(
                "Voce nao pode acessar relatorios de outro paciente."
            )
        return patient

    if user.is_professional:
        professional = getattr(user, "professional_profile", None)
        if professional is None:
            raise PermissionDenied("Perfil profissional nao encontrado.")

        has_relationship = Appointment.objects.filter(
            clinic_id=user.clinic_id,
            professional=professional,
            patient=patient,
        ).exists()

        if not has_relationship:
            raise PermissionDenied("Voce nao pode acessar relatorios deste paciente.")

    return patient


def resolve_professional_for_user(user, professional_id=None):
    queryset = ProfessionalProfile.objects.select_related("user", "user__clinic")

    if user.is_superuser:
        if not professional_id:
            raise ValidationError(
                {"professional_id": "Informe o profissional para este relatorio."}
            )
        return get_object_or_404(queryset, pk=professional_id)

    if not user.clinic_id:
        raise PermissionDenied("Usuario sem clinica vinculada.")

    if user.is_professional:
        professional = getattr(user, "professional_profile", None)
        if professional is None:
            raise PermissionDenied("Perfil profissional nao encontrado.")

        if professional_id and str(professional.id) != str(professional_id):
            raise PermissionDenied(
                "Profissionais so podem acessar seus proprios relatorios."
            )

        return professional

    if user.is_admin:
        if not professional_id:
            raise ValidationError(
                {"professional_id": "Informe o profissional para este relatorio."}
            )

        return get_object_or_404(
            queryset.filter(user__clinic_id=user.clinic_id),
            pk=professional_id,
        )

    raise PermissionDenied("Voce nao pode acessar relatorios profissionais.")


def build_patient_report(user, patient_id, period):
    patient = resolve_patient_for_user(user, patient_id)
    queryset = appointment_queryset().filter(patient=patient)

    if not user.is_superuser:
        queryset = queryset.filter(clinic_id=user.clinic_id)

    if user.is_professional:
        queryset = queryset.filter(professional=user.professional_profile)

    queryset = apply_period(queryset, period)
    totals = status_totals_map(queryset)
    period_bounds = queryset.aggregate(
        first_appointment_at=Min("scheduled_at"),
        last_appointment_at=Max("scheduled_at"),
    )

    total = sum(totals.values())
    completed = totals[Appointment.Status.COMPLETED]
    cancelled = totals[Appointment.Status.CANCELLED]
    no_show = totals[Appointment.Status.NO_SHOW]
    attendance_base = completed + no_show

    return {
        "report": "patient",
        "period": period.as_dict(),
        "patient": patient_summary(patient),
        "summary": {
            "total_appointments": total,
            "scheduled": totals[Appointment.Status.SCHEDULED],
            "completed": completed,
            "cancelled": cancelled,
            "rescheduled": totals[Appointment.Status.RESCHEDULED],
            "no_show": no_show,
            "attendance_rate_percent": percentage(completed, attendance_base),
            "cancellation_rate_percent": percentage(cancelled, total),
            "first_appointment_at": format_datetime(
                period_bounds["first_appointment_at"]
            ),
            "last_appointment_at": format_datetime(
                period_bounds["last_appointment_at"]
            ),
        },
        "status_counts": status_counts(queryset),
        "frequency_by_month": monthly_status_breakdown(queryset),
        "appointment_history": [
            appointment_row(appointment)
            for appointment in queryset.order_by("-scheduled_at")
        ],
    }


def build_professional_summary_report(user, professional_id, period):
    professional = resolve_professional_for_user(user, professional_id)
    queryset = apply_period(
        appointment_queryset().filter(
            clinic_id=professional.user.clinic_id,
            professional=professional,
        ),
        period,
    )
    totals = status_totals_map(queryset)
    total = sum(totals.values())

    return {
        "report": "professional_summary",
        "period": period.as_dict(),
        "professional": professional_summary(professional),
        "summary": {
            "total_appointments": total,
            "unique_patients": queryset.values("patient").distinct().count(),
            "patients_attended": queryset.filter(status=Appointment.Status.COMPLETED)
            .values("patient")
            .distinct()
            .count(),
            "scheduled": totals[Appointment.Status.SCHEDULED],
            "completed": totals[Appointment.Status.COMPLETED],
            "cancelled": totals[Appointment.Status.CANCELLED],
            "rescheduled": totals[Appointment.Status.RESCHEDULED],
            "no_show": totals[Appointment.Status.NO_SHOW],
            "cancellation_rate_percent": percentage(
                totals[Appointment.Status.CANCELLED],
                total,
            ),
        },
        "status_counts": status_counts(queryset),
        "volume_by_month": monthly_status_breakdown(queryset),
        "patients": professional_patient_rows(queryset),
        "appointments": [
            appointment_row(appointment)
            for appointment in queryset.order_by("-scheduled_at")
        ],
    }


def build_professional_patient_report(user, patient_id, professional_id, period):
    professional = resolve_professional_for_user(user, professional_id)
    patient = resolve_patient_for_professional_report(user, patient_id, professional)
    queryset = apply_period(
        appointment_queryset().filter(
            clinic_id=professional.user.clinic_id,
            professional=professional,
            patient=patient,
        ),
        period,
    )
    totals = status_totals_map(queryset)
    total = sum(totals.values())
    completed = totals[Appointment.Status.COMPLETED]
    no_show = totals[Appointment.Status.NO_SHOW]

    return {
        "report": "professional_patient",
        "period": period.as_dict(),
        "professional": professional_summary(professional),
        "patient": patient_summary(patient),
        "summary": {
            "total_appointments": total,
            "completed": completed,
            "scheduled": totals[Appointment.Status.SCHEDULED],
            "cancelled": totals[Appointment.Status.CANCELLED],
            "rescheduled": totals[Appointment.Status.RESCHEDULED],
            "no_show": no_show,
            "attendance_rate_percent": percentage(completed, completed + no_show),
        },
        "status_counts": status_counts(queryset),
        "frequency_by_month": monthly_status_breakdown(queryset),
        "appointment_history": [
            appointment_row(appointment)
            for appointment in queryset.order_by("-scheduled_at")
        ],
    }


def resolve_patient_for_professional_report(user, patient_id, professional):
    patient = get_object_or_404(
        PatientProfile.objects.select_related("user", "user__clinic").filter(
            user__clinic_id=professional.user.clinic_id,
        ),
        pk=patient_id,
    )

    if user.is_patient:
        raise PermissionDenied("Pacientes nao acessam relatorios profissionais.")

    if user.is_professional and professional.user_id != user.id:
        raise PermissionDenied(
            "Profissionais so podem acessar seus proprios relatorios."
        )

    if user.is_professional:
        has_relationship = Appointment.objects.filter(
            clinic_id=professional.user.clinic_id,
            professional=professional,
            patient=patient,
        ).exists()
        if not has_relationship:
            raise PermissionDenied("Voce nao pode acessar relatorios deste paciente.")

    if not user.is_superuser and user.clinic_id != professional.user.clinic_id:
        raise PermissionDenied("Voce nao pode acessar dados de outra clinica.")

    return patient


def build_admin_appointments_report(user, period, query_params):
    queryset = appointment_queryset()
    clinic_id = query_params.get("clinic_id")
    professional_id = query_params.get("professional_id")

    if user.is_superuser:
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)
    else:
        if not user.clinic_id:
            raise PermissionDenied("Usuario sem clinica vinculada.")
        if clinic_id and str(clinic_id) != str(user.clinic_id):
            raise PermissionDenied("Voce nao pode acessar dados de outra clinica.")
        clinic_id = str(user.clinic_id)
        queryset = queryset.filter(clinic_id=user.clinic_id)

    if professional_id:
        queryset = queryset.filter(professional_id=professional_id)
        _validate_professional_scope(user, professional_id, clinic_id)

    queryset = apply_period(queryset, period)
    totals = status_totals_map(queryset)
    total = sum(totals.values())
    cancellations = totals[Appointment.Status.CANCELLED]

    return {
        "report": "admin_appointments",
        "period": period.as_dict(),
        "clinic_id": clinic_id or (str(user.clinic_id) if user.clinic_id else None),
        "filters": {
            "professional_id": professional_id,
        },
        "summary": {
            "total_appointments": total,
            "scheduled": totals[Appointment.Status.SCHEDULED],
            "completed": totals[Appointment.Status.COMPLETED],
            "cancelled": cancellations,
            "rescheduled": totals[Appointment.Status.RESCHEDULED],
            "no_show": totals[Appointment.Status.NO_SHOW],
            "cancellation_rate_percent": percentage(cancellations, total),
        },
        "status_counts": status_counts(queryset),
        "consultations_by_period": monthly_status_breakdown(queryset),
        "consultations_by_professional": admin_professional_rows(queryset),
        "appointments": [
            appointment_row(appointment)
            for appointment in queryset.order_by("-scheduled_at")
        ],
    }


def _validate_professional_scope(user, professional_id, clinic_id=None):
    queryset = ProfessionalProfile.objects.select_related("user")

    if user.is_superuser:
        queryset = queryset.filter(pk=professional_id)
        if clinic_id:
            queryset = queryset.filter(user__clinic_id=clinic_id)
    else:
        queryset = queryset.filter(
            pk=professional_id,
            user__clinic_id=user.clinic_id,
        )

    if not queryset.exists():
        raise PermissionDenied("Profissional fora do escopo permitido.")


def status_totals_map(queryset):
    totals = {status: 0 for status in STATUS_CODES}

    for row in queryset.values("status").annotate(total=Count("id")):
        totals[row["status"]] = row["total"]

    return totals


def status_counts(queryset):
    totals = status_totals_map(queryset)
    return [
        {
            "status": status,
            "label": STATUS_LABELS.get(status, status),
            "total": totals.get(status, 0),
        }
        for status in STATUS_CODES
    ]


def monthly_status_breakdown(queryset):
    rows = (
        queryset.annotate(month=TruncMonth("scheduled_at"))
        .values(
            "month",
            "status",
        )
        .annotate(total=Count("id"))
        .order_by("month", "status")
    )

    months = OrderedDict()
    for row in rows:
        month_key = format_month(row["month"])
        if month_key not in months:
            months[month_key] = {
                "month": month_key,
                "total": 0,
                **{status: 0 for status in STATUS_CODES},
            }

        months[month_key][row["status"]] = row["total"]
        months[month_key]["total"] += row["total"]

    return list(months.values())


def professional_patient_rows(queryset):
    rows = (
        queryset.values(
            "patient_id",
            "patient__user__id",
            "patient__user__full_name",
            "patient__user__email",
        )
        .annotate(
            total_appointments=Count("id"),
            completed=Count("id", filter=Q(status=Appointment.Status.COMPLETED)),
            cancelled=Count("id", filter=Q(status=Appointment.Status.CANCELLED)),
            no_show=Count("id", filter=Q(status=Appointment.Status.NO_SHOW)),
            last_appointment_at=Max("scheduled_at"),
        )
        .order_by("-completed", "patient__user__full_name")
    )

    return [
        {
            "patient_id": str(row["patient_id"]),
            "user_id": str(row["patient__user__id"]),
            "patient_name": row["patient__user__full_name"],
            "patient_email": row["patient__user__email"],
            "total_appointments": row["total_appointments"],
            "completed": row["completed"],
            "cancelled": row["cancelled"],
            "no_show": row["no_show"],
            "last_appointment_at": format_datetime(row["last_appointment_at"]),
        }
        for row in rows
    ]


def admin_professional_rows(queryset):
    rows = (
        queryset.values(
            "professional_id",
            "professional__user__id",
            "professional__user__full_name",
            "professional__user__email",
        )
        .annotate(
            total_appointments=Count("id"),
            unique_patients=Count("patient", distinct=True),
            completed=Count("id", filter=Q(status=Appointment.Status.COMPLETED)),
            scheduled=Count("id", filter=Q(status=Appointment.Status.SCHEDULED)),
            cancelled=Count("id", filter=Q(status=Appointment.Status.CANCELLED)),
            rescheduled=Count("id", filter=Q(status=Appointment.Status.RESCHEDULED)),
            no_show=Count("id", filter=Q(status=Appointment.Status.NO_SHOW)),
        )
        .order_by("professional__user__full_name")
    )

    return [
        {
            "professional_id": str(row["professional_id"]),
            "user_id": str(row["professional__user__id"]),
            "professional_name": row["professional__user__full_name"],
            "professional_email": row["professional__user__email"],
            "unique_patients": row["unique_patients"],
            "total_appointments": row["total_appointments"],
            "scheduled": row["scheduled"],
            "completed": row["completed"],
            "cancelled": row["cancelled"],
            "rescheduled": row["rescheduled"],
            "no_show": row["no_show"],
        }
        for row in rows
    ]


def appointment_row(appointment):
    return {
        "id": str(appointment.id),
        "clinic_id": str(appointment.clinic_id),
        "patient_id": str(appointment.patient_id),
        "patient_name": appointment.patient.user.full_name,
        "professional_id": str(appointment.professional_id),
        "professional_name": appointment.professional.user.full_name,
        "scheduled_at": format_datetime(appointment.scheduled_at),
        "duration_minutes": appointment.duration_minutes,
        "status": appointment.status,
        "status_label": appointment.get_status_display(),
        "cancel_reason": appointment.cancel_reason,
        "created_at": format_datetime(appointment.created_at),
        "updated_at": format_datetime(appointment.updated_at),
    }


def patient_summary(patient):
    return {
        "id": str(patient.id),
        "user_id": str(patient.user_id),
        "full_name": patient.user.full_name,
        "email": patient.user.email,
        "phone": patient.user.phone,
        "cpf": patient.cpf,
        "birth_date": patient.birth_date.isoformat() if patient.birth_date else None,
        "clinic_id": str(patient.user.clinic_id) if patient.user.clinic_id else None,
    }


def professional_summary(professional):
    return {
        "id": str(professional.id),
        "user_id": str(professional.user_id),
        "full_name": professional.user.full_name,
        "email": professional.user.email,
        "phone": professional.user.phone,
        "crp": professional.crp,
        "specialty": professional.specialty,
        "clinic_id": (
            str(professional.user.clinic_id) if professional.user.clinic_id else None
        ),
    }


def percentage(numerator, denominator):
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def format_datetime(value):
    if not value:
        return None
    return timezone.localtime(value).isoformat()


def format_month(value):
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.strftime("%Y-%m")
