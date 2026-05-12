from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminOnly, IsProfessionalOrAdmin
from apps.appointments.models import Appointment

from .exports import build_excel_response, build_pdf_response
from .services import (
    build_admin_appointments_report,
    build_patient_report,
    build_professional_patient_report,
    build_professional_summary_report,
    parse_report_period,
)


STATUS_COLUMNS = [
    ('label', 'Status'),
    ('total', 'Total'),
]
MONTH_COLUMNS = [
    ('month', 'Mes'),
    ('total', 'Total'),
    (Appointment.Status.SCHEDULED, 'Agendadas'),
    (Appointment.Status.COMPLETED, 'Realizadas'),
    (Appointment.Status.CANCELLED, 'Canceladas'),
    (Appointment.Status.RESCHEDULED, 'Remarcadas'),
    (Appointment.Status.NO_SHOW, 'No show'),
]
APPOINTMENT_COLUMNS = [
    ('scheduled_at', 'Data'),
    ('patient_name', 'Paciente'),
    ('professional_name', 'Profissional'),
    ('duration_minutes', 'Duracao'),
    ('status_label', 'Status'),
    ('cancel_reason', 'Motivo cancelamento'),
]
PATIENT_COLUMNS = [
    ('patient_name', 'Paciente'),
    ('patient_email', 'Email'),
    ('total_appointments', 'Consultas'),
    ('completed', 'Realizadas'),
    ('cancelled', 'Canceladas'),
    ('no_show', 'No show'),
    ('last_appointment_at', 'Ultima consulta'),
]
PROFESSIONAL_COLUMNS = [
    ('professional_name', 'Profissional'),
    ('professional_email', 'Email'),
    ('unique_patients', 'Pacientes'),
    ('total_appointments', 'Consultas'),
    ('scheduled', 'Agendadas'),
    ('completed', 'Realizadas'),
    ('cancelled', 'Canceladas'),
    ('rescheduled', 'Remarcadas'),
    ('no_show', 'No show'),
]


class PatientReportView(APIView):
    """
    GET /api/reports/patients/<patient_id>/
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        report = build_patient_report(
            request.user,
            patient_id,
            parse_report_period(request.query_params),
        )
        return Response(report)


class PatientReportPDFView(APIView):
    """
    GET /api/reports/patients/<patient_id>/pdf/
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        report = build_patient_report(
            request.user,
            patient_id,
            parse_report_period(request.query_params),
        )
        return build_pdf_response(
            'Relatorio do paciente',
            report_filename('relatorio-paciente', 'pdf'),
            report['summary'],
            patient_sections(report),
        )


class ProfessionalSummaryReportView(APIView):
    """
    GET /api/reports/professionals/summary/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request):
        report = build_professional_summary_report(
            request.user,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return Response(report)


class ProfessionalSummaryPDFView(APIView):
    """
    GET /api/reports/professionals/summary/pdf/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request):
        report = build_professional_summary_report(
            request.user,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return build_pdf_response(
            'Relatorio do profissional',
            report_filename('relatorio-profissional', 'pdf'),
            report['summary'],
            professional_summary_sections(report),
        )


class ProfessionalSummaryExcelView(APIView):
    """
    GET /api/reports/professionals/summary/excel/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request):
        report = build_professional_summary_report(
            request.user,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return build_excel_response(
            report_filename('relatorio-profissional', 'xlsx'),
            report['summary'],
            professional_summary_sections(report),
        )


class ProfessionalPatientReportView(APIView):
    """
    GET /api/reports/professionals/patients/<patient_id>/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request, patient_id):
        report = build_professional_patient_report(
            request.user,
            patient_id,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return Response(report)


class ProfessionalPatientPDFView(APIView):
    """
    GET /api/reports/professionals/patients/<patient_id>/pdf/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request, patient_id):
        report = build_professional_patient_report(
            request.user,
            patient_id,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return build_pdf_response(
            'Relatorio individual do paciente',
            report_filename('relatorio-profissional-paciente', 'pdf'),
            report['summary'],
            patient_sections(report),
        )


class ProfessionalPatientExcelView(APIView):
    """
    GET /api/reports/professionals/patients/<patient_id>/excel/?professional_id=<id>
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request, patient_id):
        report = build_professional_patient_report(
            request.user,
            patient_id,
            request.query_params.get('professional_id'),
            parse_report_period(request.query_params),
        )
        return build_excel_response(
            report_filename('relatorio-profissional-paciente', 'xlsx'),
            report['summary'],
            patient_sections(report),
        )


class AdminAppointmentsReportView(APIView):
    """
    GET /api/reports/admin/appointments/
    """
    permission_classes = [IsAdminOnly]

    def get(self, request):
        report = build_admin_appointments_report(
            request.user,
            parse_report_period(request.query_params),
            request.query_params,
        )
        return Response(report)


class AdminAppointmentsPDFView(APIView):
    """
    GET /api/reports/admin/appointments/pdf/
    """
    permission_classes = [IsAdminOnly]

    def get(self, request):
        report = build_admin_appointments_report(
            request.user,
            parse_report_period(request.query_params),
            request.query_params,
        )
        return build_pdf_response(
            'Relatorio administrativo de consultas',
            report_filename('relatorio-admin-consultas', 'pdf'),
            report['summary'],
            admin_sections(report),
        )


class AdminAppointmentsExcelView(APIView):
    """
    GET /api/reports/admin/appointments/excel/
    """
    permission_classes = [IsAdminOnly]

    def get(self, request):
        report = build_admin_appointments_report(
            request.user,
            parse_report_period(request.query_params),
            request.query_params,
        )
        return build_excel_response(
            report_filename('relatorio-admin-consultas', 'xlsx'),
            report['summary'],
            admin_sections(report),
        )


def patient_sections(report):
    return [
        {
            'title': 'Status das consultas',
            'rows': report['status_counts'],
            'columns': STATUS_COLUMNS,
        },
        {
            'title': 'Frequencia mensal',
            'rows': report['frequency_by_month'],
            'columns': MONTH_COLUMNS,
        },
        {
            'title': 'Historico de consultas',
            'rows': report['appointment_history'],
            'columns': APPOINTMENT_COLUMNS,
        },
    ]


def professional_summary_sections(report):
    return [
        {
            'title': 'Status das consultas',
            'rows': report['status_counts'],
            'columns': STATUS_COLUMNS,
        },
        {
            'title': 'Volume mensal',
            'rows': report['volume_by_month'],
            'columns': MONTH_COLUMNS,
        },
        {
            'title': 'Pacientes atendidos',
            'rows': report['patients'],
            'columns': PATIENT_COLUMNS,
        },
        {
            'title': 'Consultas',
            'rows': report['appointments'],
            'columns': APPOINTMENT_COLUMNS,
        },
    ]


def admin_sections(report):
    return [
        {
            'title': 'Status das consultas',
            'rows': report['status_counts'],
            'columns': STATUS_COLUMNS,
        },
        {
            'title': 'Consultas por periodo',
            'rows': report['consultations_by_period'],
            'columns': MONTH_COLUMNS,
        },
        {
            'title': 'Consultas por profissional',
            'rows': report['consultations_by_professional'],
            'columns': PROFESSIONAL_COLUMNS,
        },
        {
            'title': 'Consultas',
            'rows': report['appointments'],
            'columns': APPOINTMENT_COLUMNS,
        },
    ]


def report_filename(prefix, extension):
    generated_at = timezone.localtime(timezone.now()).strftime('%Y%m%d-%H%M%S')
    return '{}-{}.{}'.format(prefix, generated_at, extension)
