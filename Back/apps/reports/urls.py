from django.urls import path

from . import views


urlpatterns = [
    path(
        'patients/<uuid:patient_id>/',
        views.PatientReportView.as_view(),
        name='report-patient',
    ),
    path(
        'patients/<uuid:patient_id>/pdf/',
        views.PatientReportPDFView.as_view(),
        name='report-patient-pdf',
    ),
    path(
        'professionals/summary/',
        views.ProfessionalSummaryReportView.as_view(),
        name='report-professional-summary',
    ),
    path(
        'professionals/summary/pdf/',
        views.ProfessionalSummaryPDFView.as_view(),
        name='report-professional-summary-pdf',
    ),
    path(
        'professionals/summary/excel/',
        views.ProfessionalSummaryExcelView.as_view(),
        name='report-professional-summary-excel',
    ),
    path(
        'professionals/patients/<uuid:patient_id>/',
        views.ProfessionalPatientReportView.as_view(),
        name='report-professional-patient',
    ),
    path(
        'professionals/patients/<uuid:patient_id>/pdf/',
        views.ProfessionalPatientPDFView.as_view(),
        name='report-professional-patient-pdf',
    ),
    path(
        'professionals/patients/<uuid:patient_id>/excel/',
        views.ProfessionalPatientExcelView.as_view(),
        name='report-professional-patient-excel',
    ),
    path(
        'admin/appointments/',
        views.AdminAppointmentsReportView.as_view(),
        name='report-admin-appointments',
    ),
    path(
        'admin/appointments/pdf/',
        views.AdminAppointmentsPDFView.as_view(),
        name='report-admin-appointments-pdf',
    ),
    path(
        'admin/appointments/excel/',
        views.AdminAppointmentsExcelView.as_view(),
        name='report-admin-appointments-excel',
    ),
]
