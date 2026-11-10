from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Clinic, Room
from .serializers import ClinicSerializer, RoomSerializer
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


class ClinicRoomListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/clinics/<clinic_id>/rooms/
    POST /api/clinics/<clinic_id>/rooms/
    """
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_clinic(self):
        clinic = generics.get_object_or_404(Clinic, pk=self.kwargs['clinic_id'])
        user = self.request.user
        if not user.is_superuser and user.clinic_id != clinic.id:
            raise PermissionDenied('Voce nao pode acessar salas de outra clinica.')
        return clinic

    def get_queryset(self):
        queryset = Room.objects.filter(clinic=self.get_clinic())
        if self.request.method == 'GET' and not self.request.user.is_admin:
            queryset = queryset.filter(is_active=True)
        return queryset

    def get_interval(self):
        """
        Intervalo `[start, end)` pedido via querystring, em ISO-8601.

        Sem `start`, usa o instante atual; sem `end`, o intervalo e
        instantaneo. Retorna (start, end).
        """
        def parse(nome):
            bruto = self.request.query_params.get(nome)
            if not bruto:
                return None
            valor = parse_datetime(bruto)
            if valor is None:
                raise ValidationError(
                    {nome: 'Informe uma data/hora valida no formato ISO-8601.'}
                )
            if timezone.is_naive(valor):
                valor = timezone.make_aware(valor)
            return valor

        start = parse('start') or timezone.now()
        end = parse('end') or start
        if end < start:
            raise ValidationError(
                {'end': 'O fim do intervalo deve ser depois do inicio.'}
            )
        return start, end

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # `status` so faz sentido na listagem: POST devolve a sala recem-criada.
        if self.request.method == 'GET':
            start, end = self.get_interval()
            context['occupied_room_ids'] = Room.occupied_ids_between(
                self.get_clinic(), start, end
            )
        return context

    def perform_create(self, serializer):
        if not (self.request.user.is_superuser or self.request.user.is_admin):
            raise PermissionDenied('Apenas administradores podem criar salas.')
        serializer.save(clinic=self.get_clinic())


class ClinicRoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/clinics/<clinic_id>/rooms/<room_id>/
    """
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        clinic = generics.get_object_or_404(Clinic, pk=self.kwargs['clinic_id'])
        user = self.request.user
        if not user.is_superuser and user.clinic_id != clinic.id:
            raise PermissionDenied('Voce nao pode acessar salas de outra clinica.')
        return Room.objects.filter(clinic=clinic)

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsAdminOnly()]
        return [permissions.IsAuthenticated()]

    def perform_destroy(self, instance):
        if instance.appointments.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {'detail': 'Não é possível excluir uma sala com agendamentos vinculados.'}
            )
        instance.delete()
