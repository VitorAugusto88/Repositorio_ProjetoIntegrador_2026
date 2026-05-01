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
    GET  /api/auth/me/  — Retorna dados do usuario autenticado.
    PATCH /api/auth/me/ — Atualiza full_name e phone do usuario autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        allowed_fields = {'full_name', 'phone'}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}

        serializer = UserSerializer(request.user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PatientProfileView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/auth/patients/<uuid>/profile/
    Paciente ve e edita o proprio perfil.
    Profissional e admin podem editar a anamnese.
    """
    serializer_class = PatientProfileSerializer
    permission_classes = [permissions.AllowAny]

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
    permission_classes = [permissions.AllowAny]

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


class ProfessionalDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/auth/professionals/<uuid>/
    PATCH /api/auth/professionals/<uuid>/
    Psicólogo edita o próprio perfil. Admin edita qualquer profissional da clínica.
    """
    serializer_class = ProfessionalProfileSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return ProfessionalProfile.objects.select_related('user').all()

        # Admin ve apenas profissionais da propria clinica
        if user.is_admin:
            return ProfessionalProfile.objects.select_related('user').filter(
                user__clinic_id=user.clinic_id
            )

        # Psicologo ve apenas o proprio perfil
        return ProfessionalProfile.objects.select_related('user').filter(
            user=user
        )

    def get_object(self):
        obj = super().get_object()

        # Psicologo so pode editar o proprio perfil
        user = self.request.user
        if user.is_professional and obj.user != user:
            raise PermissionDenied('Voce so pode editar o proprio perfil.')

        return obj


class ClinicPatientListView(generics.ListAPIView):
    """
    GET /api/auth/<clinic_id>/patients/
    Lista os pacientes da clinica como PatientProfile.
    Retorna PatientProfile.id no campo 'id' — necessario para POST /api/appointments/.
    - Admin ve todos os pacientes da propria clinica
    - Psicologo ve apenas pacientes com quem tem consulta
    """
    serializer_class = PatientListSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_queryset(self):
        clinic_id = str(self.kwargs['pk'])
        user = self.request.user

        if user.is_superuser:
            return PatientProfile.objects.select_related('user').filter(
                user__clinic_id=clinic_id,
                user__is_active=True
            )

        if not user.clinic_id or str(user.clinic_id) != clinic_id:
            raise PermissionDenied('Voce nao pode acessar pacientes de outra clinica.')

        if user.is_admin:
            return PatientProfile.objects.select_related('user').filter(
                user__clinic_id=user.clinic_id,
                user__is_active=True
            )

        if user.is_professional:
            return PatientProfile.objects.select_related('user').filter(
                user__clinic_id=user.clinic_id,
                appointments__professional=user.professional_profile,
                appointments__clinic_id=user.clinic_id
            ).distinct()

        return PatientProfile.objects.none()