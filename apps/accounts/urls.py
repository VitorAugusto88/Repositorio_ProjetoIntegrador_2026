from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .views import ClinicPatientListView

urlpatterns = [
    # Autenticação
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Usuário autenticado
    path('me/', views.MeView.as_view(), name='me'),

    # Perfis
    path('patients/<uuid:user_id>/profile/', views.PatientProfileView.as_view(), name='patient_profile'),
    path('professionals/', views.ProfessionalListView.as_view(), name='professionals'),
    path('professionals/<uuid:pk>/', views.ProfessionalDetailView.as_view(), name='professional-detail'),  # ADICIONADO
    path('<uuid:pk>/patients/', ClinicPatientListView.as_view(), name='clinic-patient-list'),
]

# Gestao interna de usuarios
urlpatterns += [
    path('admin/users/', views.AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/users/patients/', views.AdminPatientCreateView.as_view(), name='admin-patient-create'),
    path('admin/users/professionals/', views.AdminProfessionalCreateView.as_view(), name='admin-professional-create'),
    path('admin/users/<uuid:pk>/', views.AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('admin/users/<uuid:pk>/status/', views.AdminUserStatusView.as_view(), name='admin-user-status'),
    path('admin/users/<uuid:pk>/role/', views.AdminUserRoleView.as_view(), name='admin-user-role'),
]

# Senhas e convites
urlpatterns += [
    path('password/reset/', views.PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password/reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('password/invite/confirm/', views.PasswordInviteConfirmView.as_view(), name='password-invite-confirm'),
]
