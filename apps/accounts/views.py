from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import User, PatientProfile, ProfessionalProfile
from .serializers import (
    RegisterSerializer, UserSerializer,
    PatientProfileSerializer, ProfessionalProfileSerializer,
    CustomTokenObtainSerializer,
)
from .permissions import IsAdminOrSelf, IsProfessionalOrAdmin


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Retorna access_token e refresh_token com role embutida.
    """
    serializer_class = CustomTokenObtainSerializer


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Cadastro público — apenas pacientes.
    """
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    """
    GET /api/auth/me/
    Retorna dados do usuário autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class PatientProfileView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/auth/patients/<uuid>/profile/
    Paciente vê e edita o próprio perfil.
    Profissional e admin podem editar a anamnese.
    """
    serializer_class = PatientProfileSerializer
    permission_classes = [IsAdminOrSelf]

    def get_object(self):
        return generics.get_object_or_404(
            PatientProfile,
            user__id=self.kwargs['user_id']
        )


class ProfessionalListView(generics.ListAPIView):
    """
    GET /api/auth/professionals/
    Lista psicólogos disponíveis — visível para pacientes
    escolherem com quem agendar.
    """
    serializer_class = ProfessionalProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        clinic_id = self.request.query_params.get('clinic_id')
        qs = ProfessionalProfile.objects.select_related('user').filter(user__is_active=True)
        if clinic_id:
            qs = qs.filter(user__clinic_id=clinic_id)
        return qs
