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
    POST /api/appointments/availability/
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
        if not self.request.user.is_professional:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Apenas psicologos podem cadastrar horarios.')
        serializer.save(professional=self.request.user.professional_profile)


class AvailabilityDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/appointments/availability/<id>/
    """
    serializer_class = AvailabilitySerializer
    permission_classes = [IsProfessionalOrAdmin]
    queryset = Availability.objects.all()


class AppointmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/appointments/
    POST /api/appointments/
    """
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]  # CORRIGIDO: era AllowAny

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

        return Appointment.objects.filter(
            patient=user.patient_profile
        ).select_related('professional__user', 'clinic')

    def perform_create(self, serializer):
        user = self.request.user

        if user.is_admin:
            serializer.save()
            return

        if user.is_professional:
            serializer.save()
            return

        if not hasattr(user, 'patient_profile'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Apenas pacientes podem agendar consultas.')

        serializer.save(patient=user.patient_profile)


class AppointmentDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/appointments/<id>/
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

    def partial_update(self, request, *args, **kwargs):
        allowed_statuses = {'completed', 'rescheduled', 'no_show', 'scheduled'}
        new_status = request.data.get('status')
        if new_status and new_status in allowed_statuses:
            if not (request.user.is_professional or request.user.is_admin):
                return Response(
                    {'erro': 'Apenas psicologos podem alterar o status da consulta.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        return super().partial_update(request, *args, **kwargs)


class AppointmentCancelView(APIView):
    """
    POST /api/appointments/<id>/cancel/
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        appointment = get_object_or_404(Appointment, pk=pk)

        user = request.user
        if not (user.is_admin or
                (user.is_patient and appointment.patient == user.patient_profile) or
                (user.is_professional and appointment.professional == user.professional_profile)):
            return Response(
                {'erro': 'Voce nao tem permissao para cancelar esta consulta.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AppointmentCancelSerializer(instance=appointment, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'mensagem': 'Consulta cancelada com sucesso.'})


class SessionNoteView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/appointments/<id>/notes/
    Apenas psicologos — admin nao tem professional_profile, nao deve acessar.
    """
    serializer_class = SessionNoteSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_object(self):
        user = self.request.user

        # Admin nao tem professional_profile — bloquear antes de tentar acessar
        if not user.is_professional:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Apenas psicologos podem acessar notas de sessao.')

        appointment = get_object_or_404(
            Appointment, pk=self.kwargs['pk'],
            professional=user.professional_profile
        )
        note, _ = SessionNote.objects.get_or_create(appointment=appointment)
        return note


class RatingCreateView(generics.CreateAPIView):
    """
    POST /api/appointments/<id>/rating/
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