from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from .models import Appointment, Availability, SessionNote
from .serializers import (
    AppointmentSerializer, AppointmentCancelSerializer,
    AvailabilitySerializer, SessionNoteSerializer
)
from apps.accounts.permissions import CanManageAvailability, IsProfessionalOrAdmin
from apps.audit.models import AuditLog
from apps.audit.services import (
    changed_model_fields,
    log_audit_event,
    model_field_snapshot,
)


APPOINTMENT_AUDIT_FIELDS = [
    'patient_id',
    'professional_id',
    'clinic_id',
    'scheduled_at',
    'duration_minutes',
    'status',
    'cancel_reason',
]


def log_appointment_event(request, action, appointment, metadata=None):
    log_audit_event(
        action=action,
        target=appointment,
        request=request,
        metadata=metadata or {},
    )


def get_appointments_for_user(user):
    queryset = Appointment.objects.select_related(
        'patient__user', 'professional__user', 'clinic'
    )

    if user.is_superuser:
        return queryset

    if user.is_admin:
        if not user.clinic_id:
            return queryset.none()
        return queryset.filter(clinic_id=user.clinic_id)

    if user.is_professional:
        professional = getattr(user, 'professional_profile', None)
        if professional is None:
            return queryset.none()
        return queryset.filter(
            clinic_id=user.clinic_id,
            professional=professional
        )

    if user.is_patient:
        patient = getattr(user, 'patient_profile', None)
        if patient is None:
            return queryset.none()
        return queryset.filter(
            clinic_id=user.clinic_id,
            patient=patient
        )

    return queryset.none()


class AvailabilityListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/appointments/availability/?professional=<id>
    POST /api/appointments/availability/
    """
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Availability.objects.select_related('professional__user').filter(blocked=False)
        professional_id = self.request.query_params.get('professional')

        if not user.is_superuser:
            if not user.clinic_id:
                return qs.none()

            qs = qs.filter(professional__user__clinic_id=user.clinic_id)

        if professional_id:
            qs = qs.filter(professional_id=professional_id)
        return qs

    def perform_create(self, serializer):
        if not self.request.user.is_professional:
            raise PermissionDenied('Apenas psicologos podem cadastrar horarios.')

        professional = getattr(self.request.user, 'professional_profile', None)
        if professional is None:
            raise PermissionDenied('Perfil profissional nao encontrado.')

        serializer.save(professional=professional)


class AvailabilityDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/appointments/availability/<id>/
    """
    serializer_class = AvailabilitySerializer
    permission_classes = [CanManageAvailability]

    def get_queryset(self):
        user = self.request.user
        queryset = Availability.objects.select_related('professional__user')

        if user.is_superuser:
            return queryset

        if user.is_admin:
            if not user.clinic_id:
                return queryset.none()
            return queryset.filter(professional__user__clinic_id=user.clinic_id)

        if user.is_professional:
            professional = getattr(user, 'professional_profile', None)
            if professional is None:
                return queryset.none()
            return queryset.filter(professional=professional)

        return queryset.none()

    def perform_update(self, serializer):
        serializer.save(professional=serializer.instance.professional)


class AppointmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/appointments/
    POST /api/appointments/
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]  # CORRIGIDO: era AllowAny

    def get_queryset(self):
        qs = get_appointments_for_user(self.request.user)

        # Filtro opcional por paciente (PatientProfile.id) — usado pela ficha do
        # paciente no frontend para montar o histórico de consultas.
        patient_id = self.request.query_params.get('patient')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user

        if user.is_superuser:
            appointment = serializer.save()
            log_appointment_event(
                self.request,
                AuditLog.Action.APPOINTMENT_CREATED,
                appointment,
            )
            return

        if not user.clinic_id:
            raise PermissionDenied('Usuario sem clinica vinculada.')

        if user.is_admin:
            appointment = serializer.save(clinic_id=user.clinic_id)
            log_appointment_event(
                self.request,
                AuditLog.Action.APPOINTMENT_CREATED,
                appointment,
            )
            return

        if user.is_professional:
            professional = getattr(user, 'professional_profile', None)
            if professional is None:
                raise PermissionDenied('Perfil profissional nao encontrado.')
            appointment = serializer.save(
                clinic_id=user.clinic_id,
                professional=professional
            )
            log_appointment_event(
                self.request,
                AuditLog.Action.APPOINTMENT_CREATED,
                appointment,
            )
            return

        patient = getattr(user, 'patient_profile', None)
        if patient is None:
            raise PermissionDenied('Apenas pacientes podem agendar consultas.')

        appointment = serializer.save(clinic_id=user.clinic_id, patient=patient)
        log_appointment_event(
            self.request,
            AuditLog.Action.APPOINTMENT_CREATED,
            appointment,
        )


class AppointmentDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/appointments/<id>/
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_appointments_for_user(self.request.user)

    def perform_update(self, serializer):
        user = self.request.user
        before = model_field_snapshot(
            serializer.instance,
            APPOINTMENT_AUDIT_FIELDS,
        )

        if user.is_superuser:
            appointment = serializer.save()
        elif user.is_admin:
            appointment = serializer.save(clinic_id=user.clinic_id)
        elif user.is_professional:
            appointment = serializer.save(
                clinic_id=user.clinic_id,
                professional=user.professional_profile
            )
        else:
            patient = getattr(user, 'patient_profile', None)
            if patient is None:
                raise PermissionDenied('Perfil de paciente nao encontrado.')

            appointment = serializer.save(clinic_id=user.clinic_id, patient=patient)

        changed_fields = changed_model_fields(
            before,
            appointment,
            APPOINTMENT_AUDIT_FIELDS,
        )

        if changed_fields:
            log_appointment_event(
                self.request,
                AuditLog.Action.APPOINTMENT_UPDATED,
                appointment,
                metadata={'changed_fields': changed_fields},
            )

    def partial_update(self, request, *args, **kwargs):
        allowed_statuses = {'completed', 'rescheduled', 'no_show', 'scheduled'}
        new_status = request.data.get('status')
        if new_status and new_status in allowed_statuses:
            if not (request.user.is_professional or request.user.is_admin):
                return Response(
                    {'erro': 'Apenas psicologos podem alterar o status da consulta.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return super().partial_update(request, *args, **kwargs)


class AppointmentCancelView(APIView):
    """
    POST /api/appointments/<id>/cancel/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        appointment = get_object_or_404(get_appointments_for_user(user), pk=pk)

        can_cancel = (
            user.is_admin
            or (user.is_patient and appointment.patient == user.patient_profile)
            or (
                user.is_professional
                and appointment.professional == user.professional_profile
            )
        )
        if not can_cancel:
            return Response(
                {'erro': 'Voce nao tem permissao para cancelar esta consulta.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AppointmentCancelSerializer(
            instance=appointment,
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_appointment_event(
            request,
            AuditLog.Action.APPOINTMENT_CANCELLED,
            appointment,
            metadata={'cancel_reason_provided': True},
        )
        return Response({'mensagem': 'Consulta cancelada com sucesso.'})


class SessionNoteView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/appointments/<id>/notes/
    Apenas psicologos — admin nao tem professional_profile, nao deve acessar.
    """
    serializer_class = SessionNoteSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_object(self):
        user = self.request.user

        # Admin nao tem professional_profile — bloquear antes de tentar acessar
        if not user.is_professional:
            raise PermissionDenied('Apenas psicologos podem acessar notas de sessao.')

        appointment = get_object_or_404(
            Appointment, pk=self.kwargs['pk'],
            clinic_id=user.clinic_id,
            professional=user.professional_profile
        )
        note, _ = SessionNote.objects.get_or_create(appointment=appointment)
        return note


class ProfessionalAppointmentSummaryView(APIView):
    """
    GET /api/appointments/summary/
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request):
        from django.utils import timezone
        from django.utils.timezone import localdate

        hoje = localdate()
        if not request.user.is_professional:
            raise PermissionDenied('Apenas psicologos podem acessar este resumo.')

        professional = request.user.professional_profile

        consultas_hoje = Appointment.objects.filter(
            clinic_id=request.user.clinic_id,
            professional=professional,
            scheduled_at__date=hoje,
            status='scheduled'
        ).count()

        proxima = Appointment.objects.filter(
            clinic_id=request.user.clinic_id,
            professional=professional,
            scheduled_at__gte=timezone.now(),
            status='scheduled'
        ).order_by('scheduled_at').first()

        total_pacientes = Appointment.objects.filter(
            clinic_id=request.user.clinic_id,
            professional=professional
        ).values('patient').distinct().count()

        return Response({
            'consultas_hoje': consultas_hoje,
            'proxima_consulta': AppointmentSerializer(proxima).data if proxima else None,
            'total_pacientes': total_pacientes,
        })
