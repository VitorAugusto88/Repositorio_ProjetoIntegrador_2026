from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # Autenticação
    path('login/', views.LoginView.as_view(), name='login'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', views.RegisterView.as_view(), name='register'),

    # Usuário autenticado
    path('me/', views.MeView.as_view(), name='me'),

    # Perfis
    path('patients/<uuid:user_id>/profile/', views.PatientProfileView.as_view(), name='patient_profile'),
    path('professionals/', views.ProfessionalListView.as_view(), name='professionals'),
]
