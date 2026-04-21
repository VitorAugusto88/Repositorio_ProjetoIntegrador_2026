# Views da Fase 2
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from .models import Appointment, Availability, SessionNote, Rating
from .serializers import (
    AppointmentSerializer, AppointmentCancelSerializer,
    AvailabilitySerializer, SessionNoteSerializer, RatingSerializer
)
from apps.accounts.permissions import IsProfessionalOrAdmin


class AvailabilityListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/appointments/availability/?professional=<id>
    Lista os horários disponíveis de um psicólogo.
    O frontend usa isso para montar o calendário.

    POST /api/appointments/availability/
    Psicólogo cadastra seus horários disponíveis.
    """
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Availability.objects.filter(blocked=False)
        professional_id = self.request.query_params.get('professional')
        if professional_id:
            qs = qs.filter(professional_id=professional_id)
        return qs

    def perform_create(self, serializer):
        # Só psicólogo pode criar seus próprios horários
        if not self.request.user.is_professional:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Apenas psicólogos podem cadastrar horários.')
        serializer.save(professional=self.request.user.professional_profile)


class AvailabilityDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/appointments/availability/<id>/
    Psicólogo edita ou remove um horário específico.
    """
    serializer_class = AvailabilitySerializer
    permission_classes = [IsProfessionalOrAdmin]
    queryset = Availability.objects.all()


class AppointmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/appointments/
    Lista as consultas do usuário logado.
    Paciente vê só as suas. Psicólogo vê as suas. Admin vê todas.

    POST /api/appointments/
    Paciente agenda uma nova consulta.
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if user.is_admin:
            return Appointment.objects.all().select_related(
                'patient__user', 'professional__user', 'clinic'
            )

        if user.is_professional:
            return Appointment.objects.filter(
                professional=user.professional_profile
            ).select_related('patient__user', 'clinic')

        # Paciente vê só as próprias consultas
        return Appointment.objects.filter(
            patient=user.patient_profile
        ).select_related('professional__user', 'clinic')

    def perform_create(self, serializer):
        user = self.request.user
        print('='*50)
        print('User ID:', user.id)
        print('Email:', user.email)
        print('Role:', user.role)
        print('is_patient:', user.is_patient)
        print('is_professional:', user.is_professional)
        print('has patient_profile:', hasattr(user, 'patient_profile'))
        print('='*50)
        
        if not hasattr(user, 'patient_profile'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Apenas pacientes podem agendar consultas.')
        
        serializer.save(patient=user.patient_profile)


class AppointmentDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/appointments/<id>/
    Detalhes de uma consulta específica.

    PATCH /api/appointments/<id>/
    Atualiza status — psicólogo marca como concluída ou remarcada.
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Appointment.objects.all()
        if user.is_professional:
            return Appointment.objects.filter(professional=user.professional_profile)
        return Appointment.objects.filter(patient=user.patient_profile)


class AppointmentCancelView(APIView):
    """
    POST /api/appointments/<id>/cancel/
    Cancela uma consulta com motivo.
    Só funciona se faltar mais de 24h.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        appointment = get_object_or_404(Appointment, pk=pk)

        # Garante que só o próprio paciente ou psicólogo cancela
        user = request.user
        if not (user.is_admin or
                (user.is_patient and appointment.patient == user.patient_profile) or
                (user.is_professional and appointment.professional == user.professional_profile)):
            return Response(
                {'erro': 'Você não tem permissão para cancelar esta consulta.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AppointmentCancelSerializer(
        instance=appointment, data=request.data
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'mensagem': 'Consulta cancelada com sucesso.'})


class SessionNoteView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/appointments/<id>/notes/
    Notas de sessão do psicólogo.
    APENAS psicólogos e admins acessam — pacientes nunca veem isso.
    """
    serializer_class = SessionNoteSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_object(self):
        appointment = get_object_or_404(
            Appointment, pk=self.kwargs['pk'],
            professional=self.request.user.professional_profile
        )
        # Cria a nota se ainda não existir
        note, _ = SessionNote.objects.get_or_create(appointment=appointment)
        return note


class RatingCreateView(generics.CreateAPIView):
    """
    POST /api/appointments/<id>/rating/
    Paciente avalia a consulta após realizada.
    Só funciona uma vez por consulta.
    """
    serializer_class = RatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        appointment = get_object_or_404(
            Appointment,
            pk=self.kwargs['pk'],
            patient=self.request.user.patient_profile
        )
        serializer.save(appointment=appointment)


class ProfessionalAppointmentSummaryView(APIView):
    """
    GET /api/appointments/summary/
    Resumo do dia para o dashboard do psicólogo:
    quantas consultas hoje, próxima consulta, total de pacientes.
    """
    permission_classes = [IsProfessionalOrAdmin]

    def get(self, request):
        from django.utils import timezone
        from django.utils.timezone import localdate

        hoje = localdate()
        professional = request.user.professional_profile

        consultas_hoje = Appointment.objects.filter(
            professional=professional,
            scheduled_at__date=hoje,
            status='scheduled'
        ).count()

        proxima = Appointment.objects.filter(
            professional=professional,
            scheduled_at__gte=timezone.now(),
            status='scheduled'
        ).order_by('scheduled_at').first()

        total_pacientes = Appointment.objects.filter(
            professional=professional
        ).values('patient').distinct().count()

        return Response({
            'consultas_hoje': consultas_hoje,
            'proxima_consulta': AppointmentSerializer(proxima).data if proxima else None,
            'total_pacientes': total_pacientes,
        })