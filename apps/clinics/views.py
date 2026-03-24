from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Clinic
from .serializers import ClinicSerializer
from apps.accounts.permissions import IsAdminOnly


class ClinicListView(generics.ListAPIView):
    """
    GET /api/clinics/
    Lista as unidades da clínica.
    - Se a clínica tem uma unidade: retorna só ela
    - Se tem várias unidades (rede de clínicas): retorna todas
    Apenas usuários autenticados acessam.
    """
    serializer_class = ClinicSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Admin vê todas as unidades
        if user.is_admin:
            return Clinic.objects.filter(is_active=True)
        # Paciente e psicólogo veem só a própria unidade
        if user.clinic:
            return Clinic.objects.filter(id=user.clinic.id, is_active=True)
        return Clinic.objects.none()


class ClinicCreateView(generics.CreateAPIView):
    """
    POST /api/clinics/
    Cria uma nova unidade.
    Apenas admins podem criar — feito uma vez na configuração inicial
    ou quando a rede abre uma nova unidade.
    """
    serializer_class = ClinicSerializer
    permission_classes = [IsAdminOnly]


class ClinicDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/clinics/<id>/
    Detalhes da unidade — nome, endereço, horários, totais.

    PATCH /api/clinics/<id>/
    Edita dados da unidade — apenas admin.
    Usado para atualizar horário de funcionamento, contato, etc.
    """
    serializer_class = ClinicSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Clinic.objects.all()

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH']:
            return [IsAdminOnly()]
        return [permissions.IsAuthenticated()]

    def get_object(self):
        user = self.request.user
        clinic = super().get_object()
        # Garante que o usuário só acessa a própria unidade
        # Admin pode acessar qualquer unidade da rede
        if not user.is_admin and user.clinic != clinic:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Você não tem acesso a esta unidade.')
        return clinic


class ClinicProfessionalsView(APIView):
    """
    GET /api/clinics/<id>/professionals/
    Lista os psicólogos de uma unidade.
    Paciente usa para escolher com quem quer se consultar.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        clinic = generics.get_object_or_404(Clinic, pk=pk)
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
    Estatísticas da unidade para o dashboard admin:
    total de consultas, concluídas, canceladas,
    pacientes ativos e profissionais.
    """
    permission_classes = [IsAdminOnly]

    def get(self, request, pk):
        clinic = generics.get_object_or_404(Clinic, pk=pk)
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