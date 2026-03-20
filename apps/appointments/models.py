import uuid
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


class Rating(models.Model):
    """Avaliação anônima pós-consulta feita pelo paciente."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name='rating'
    )
    score = models.PositiveSmallIntegerField(help_text='1 a 5')
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Avaliação'

    def __str__(self):
        return f'Avaliação {self.score}/5 — {self.appointment}'
