from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from .models import Clinic
from .serializers import ClinicSerializer
from apps.accounts.permissions import IsAdminOnly, IsPlatformAdmin


class ClinicListView(generics.ListAPIView):
    """
    GET /api/clinics/
    Lista apenas a clinica do usuario logado.
    Superusuario pode listar todas.
    """
    serializer_class = ClinicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Clinic.objects.filter(is_active=True)
        if user.clinic_id:
            return Clinic.objects.filter(id=user.clinic_id, is_active=True)
        return Clinic.objects.none()


class ClinicCreateView(generics.CreateAPIView):
    """
    POST /api/clinics/create/
    Cria uma nova clinica.
    Apenas a plataforma deve usar esta rota.
    """
    serializer_class = ClinicSerializer
    permission_classes = [IsPlatformAdmin]


class ClinicDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/clinics/<id>/
    PATCH /api/clinics/<id>/
    """
    serializer_class = ClinicSerializer
    queryset = Clinic.objects.all()

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH']:
            return [IsAdminOnly()]
        return [permissions.IsAuthenticated()]

    def get_object(self):
        clinic = super().get_object()
        user = self.request.user

        if user.is_superuser:
            return clinic

        if user.clinic_id != clinic.id:
            raise PermissionDenied('Voce nao tem acesso a esta clinica.')

        return clinic


class ClinicProfessionalsView(APIView):
    """
    GET /api/clinics/<id>/professionals/
    Lista os profissionais da clinica do usuario.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        clinic = generics.get_object_or_404(Clinic, pk=pk)

        if not request.user.is_superuser and request.user.clinic_id != clinic.id:
            raise PermissionDenied('Voce nao pode listar profissionais de outra clinica.')

        from apps.accounts.models import ProfessionalProfile
        from apps.accounts.serializers import ProfessionalProfileSerializer

        professionals = ProfessionalProfile.objects.filter(
            user__clinic=clinic,
            user__is_active=True
        ).select_related('user')

        serializer = ProfessionalProfileSerializer(professionals, many=True)
        return Response(serializer.data)


class ClinicStatsView(APIView):
    """
    GET /api/clinics/<id>/stats/
    Estatisticas da clinica.
    """
    permission_classes = [IsAdminOnly]

    def get(self, request, pk):
        clinic = generics.get_object_or_404(Clinic, pk=pk)

        if request.user.clinic_id != clinic.id:
            raise PermissionDenied('Voce nao pode acessar estatisticas de outra clinica.')

        from apps.appointments.models import Appointment

        total = Appointment.objects.filter(clinic=clinic).count()
        completed = Appointment.objects.filter(clinic=clinic, status='completed').count()
        cancelled = Appointment.objects.filter(clinic=clinic, status='cancelled').count()
        total_patients = clinic.users.filter(role='patient', is_active=True).count()
        total_professionals = clinic.users.filter(role='professional', is_active=True).count()

        return Response({
            'total_appointments': total,
            'completed_appointments': completed,
            'cancelled_appointments': cancelled,
            'total_patients': total_patients,
            'total_professionals': total_professionals,
        })
