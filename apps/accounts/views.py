from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, PatientProfile, ProfessionalProfile
from .serializers import (
    RegisterSerializer, UserSerializer,
    PatientProfileSerializer, ProfessionalProfileSerializer,
    CustomTokenObtainSerializer,
)
from .permissions import IsAdminOrSelf, IsProfessionalOrAdmin
from apps.accounts.serializers import PatientListSerializer


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Retorna access_token e refresh_token com role embutida.
    """
    serializer_class = CustomTokenObtainSerializer


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Cadastro publico - apenas pacientes.
    """
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    """
    GET /api/auth/me/
    Retorna dados do usuario autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class PatientProfileView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/auth/patients/<uuid>/profile/
    Paciente ve e edita o proprio perfil.
    Profissional e admin podem editar a anamnese.
    """
    serializer_class = PatientProfileSerializer
    permission_classes = [IsAdminOrSelf]

    def get_object(self):
        queryset = PatientProfile.objects.select_related('user')
        patient_profile = generics.get_object_or_404(
            queryset,
            user__id=self.kwargs['user_id']
        )
        self.check_object_permissions(self.request, patient_profile)
        return patient_profile


class ProfessionalListView(generics.ListAPIView):
    """
    GET /api/auth/professionals/
    Lista psicologos disponiveis para a clinica do usuario logado.
    """
    serializer_class = ProfessionalProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        requested_clinic_id = self.request.query_params.get('clinic_id')

        qs = ProfessionalProfile.objects.select_related('user').filter(user__is_active=True)

        if user.is_superuser and requested_clinic_id:
            return qs.filter(user__clinic_id=requested_clinic_id)

        if not user.clinic_id:
            return qs.none()

        if requested_clinic_id and str(user.clinic_id) != requested_clinic_id:
            raise PermissionDenied('Voce nao pode listar profissionais de outra clinica.')

        return qs.filter(user__clinic_id=user.clinic_id)


class ClinicPatientListView(generics.ListAPIView):
    """
    GET /api/clinics/<id>/patients/
    Lista os pacientes da clinica do usuario.
    - Admin ve todos os pacientes da propria clinica
    - Psicologo ve apenas pacientes com quem tem consulta
    """
    serializer_class = PatientListSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_queryset(self):
        clinic_id = str(self.kwargs['pk'])
        user = self.request.user

        if user.is_superuser:
            return User.objects.filter(
                role=User.Role.PATIENT,
                clinic_id=clinic_id,
                is_active=True
            )

        if not user.clinic_id or str(user.clinic_id) != clinic_id:
            raise PermissionDenied('Voce nao pode acessar pacientes de outra clinica.')

        if user.is_admin:
            return User.objects.filter(
                role=User.Role.PATIENT,
                clinic_id=user.clinic_id,
                is_active=True
            )

        if user.is_professional:
            return User.objects.filter(
                role=User.Role.PATIENT,
                clinic_id=user.clinic_id,
                patient_profile__appointments__professional=user.professional_profile,
                patient_profile__appointments__clinic_id=user.clinic_id
            ).distinct()

        return User.objects.none()
