import uuid
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Availability(models.Model):
    """
    Define os horários disponíveis de cada psicólogo.
    weekday: 0=segunda, 1=terça ... 6=domingo
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    professional = models.ForeignKey(
        'accounts.ProfessionalProfile',
        on_delete=models.CASCADE,
        related_name='availabilities'
    )
    weekday = models.PositiveSmallIntegerField(
        choices=[(i, d) for i, d in enumerate(
            ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
        )]
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    blocked = models.BooleanField(default=False, help_text='Bloquear período (férias, folga)')

    class Meta:
        verbose_name = 'Disponibilidade'
        ordering = ['weekday', 'start_time']
        unique_together = ['professional', 'weekday', 'start_time']

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({'end_time': 'O horário de fim deve ser posterior ao de início.'})

        overlapping = Availability.objects.filter(
            professional=self.professional,
            weekday=self.weekday,
            start_time__lt=self.end_time,
            end_time__gt=self.start_time,
        ).exclude(pk=self.pk)
        if overlapping.exists():
            raise ValidationError('Este período sobrepõe outro horário já cadastrado para o mesmo profissional.')

    def __str__(self):
        return f'{self.professional} — {self.get_weekday_display()} {self.start_time}'


class Appointment(models.Model):
    """Consulta agendada entre paciente e psicólogo."""

    class Status(models.TextChoices):
        SCHEDULED = 'scheduled', 'Agendada'
        COMPLETED = 'completed', 'Realizada'
        CANCELLED = 'cancelled', 'Cancelada'
        RESCHEDULED = 'rescheduled', 'Remarcada'
        NO_SHOW = 'no_show', 'Não compareceu'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        'accounts.PatientProfile',
        on_delete=models.CASCADE,
        related_name='appointments'
    )
    professional = models.ForeignKey(
        'accounts.ProfessionalProfile',
        on_delete=models.CASCADE,
        related_name='appointments'
    )
    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.CASCADE,
        related_name='appointments'
    )

    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=50)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    cancel_reason = models.TextField(blank=True)
    # Data/hora em que a consulta foi de fato realizada. Preenchido ao concluir —
    # permite concluir uma consulta adiantada sem manter a data agendada no futuro.
    completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Consulta'
        verbose_name_plural = 'Consultas'
        ordering = ['-scheduled_at']

    def __str__(self):
        return f'{self.patient} com {self.professional} em {self.scheduled_at:%d/%m/%Y %H:%M}'

    def can_cancel(self):
        """Cancelamento permitido até 24h antes."""
        return (self.scheduled_at - timezone.now()).total_seconds() > 86400

    @property
    def ends_at(self):
        return self.scheduled_at + timedelta(minutes=self.duration_minutes)

    # Rótulo do estado derivado "dia ultrapassado" (ver is_overdue).
    OVERDUE_LABEL = 'Dia Ultrapassado'

    @property
    def is_overdue(self):
        """
        Consulta cujo DIA já passou e que continua em aberto (agendada/remarcada).

        É um estado DERIVADO — nunca gravado em `status` e sem nenhuma ação de
        usuário que o force. A comparação é por DIA (data local), não por
        horário: não aparece antes do dia da consulta nem durante o dia dela,
        só a partir do dia seguinte. Consultas já resolvidas (realizada,
        cancelada, não compareceu) nunca ficam ultrapassadas.
        """
        if self.status not in (self.Status.SCHEDULED, self.Status.RESCHEDULED):
            return False
        if not self.scheduled_at:
            return False
        return timezone.localdate(self.scheduled_at) < timezone.localdate()


class SessionNote(models.Model):
    """
    Anotações do psicólogo sobre a sessão.
    Visíveis APENAS ao profissional — nunca expor ao paciente.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name='session_note'
    )
    notes = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nota de sessão'

    def __str__(self):
        return f'Nota — {self.appointment}'
