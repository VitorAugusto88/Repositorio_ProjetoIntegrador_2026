
from django.urls import path
from . import views

urlpatterns = [
    # Disponibilidade do psicólogo
    path('availability/', views.AvailabilityListCreateView.as_view(), name='availability-list'),
    path('availability/<uuid:pk>/', views.AvailabilityDetailView.as_view(), name='availability-detail'),

    # Consultas
    path('', views.AppointmentListCreateView.as_view(), name='appointment-list'),
    path('<uuid:pk>/', views.AppointmentDetailView.as_view(), name='appointment-detail'),
    path('<uuid:pk>/cancel/', views.AppointmentCancelView.as_view(), name='appointment-cancel'),

    # Notas de sessão (só psicólogo)
    path('<uuid:pk>/notes/', views.SessionNoteView.as_view(), name='session-notes'),

    # Resumo do dashboard do psicólogo
    path('summary/', views.ProfessionalAppointmentSummaryView.as_view(), name='appointment-summary'),
]


#GET /api/appointments/ → lista todas as consultas do usuário
#GET /api/appointments/abc-123/ → detalhes da consulta com ID abc-123
#POST /api/appointments/abc-123/cancel/ → cancela essa consulta específica