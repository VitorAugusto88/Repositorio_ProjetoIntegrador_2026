import uuid
from django.db import models


class Clinic(models.Model):
    """Representa uma unidade clínica. Suporta multi-clínica."""

    class ThemePreset(models.TextChoices):
        DEFAULT = 'default', 'Verde (padrão)'
        BLUE = 'blue', 'Azul'
        PURPLE = 'purple', 'Roxo'
        CUSTOM = 'custom', 'Personalizada'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    open_from = models.TimeField(default='08:00')
    open_until = models.TimeField(default='18:00')
    is_active = models.BooleanField(default=True)

    # Logo/foto da clínica — exibida no perfil e em telas com a marca da
    # clínica. Opcional: sem logo, o frontend cai num ícone padrão.
    logo = models.ImageField(upload_to='clinics/logos/', null=True, blank=True)

    # Paleta de cores da clínica: presets prontos ou cor personalizada
    # (theme_primary_color só é usado quando theme_preset='custom').
    theme_preset = models.CharField(
        max_length=10, choices=ThemePreset.choices, default=ThemePreset.DEFAULT
    )
    theme_primary_color = models.CharField(max_length=7, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Clínica'
        verbose_name_plural = 'Clínicas'
        ordering = ['name']

    def __str__(self):
        return self.name


class Room(models.Model):
    """Sala física disponível para consultas da clínica."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name='rooms',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Sala'
        verbose_name_plural = 'Salas'
        ordering = ['name']

    # Rotulos do estado calculado (nunca persistido no banco).
    STATUS_FREE = 'livre'
    STATUS_BUSY = 'ocupada'

    def __str__(self):
        return f'{self.name} - {self.clinic.name}'

    @classmethod
    def occupied_ids_between(cls, clinic, start, end):
        """
        IDs das salas da clinica ocupadas no intervalo `[start, end)`.

        A ocupacao nunca e gravada: ela vem da intersecao com as consultas em
        aberto (agendada/remarcada). Consultas canceladas nao ocupam a sala.
        Quando `start == end` o intervalo e instantaneo e responde
        "a sala esta ocupada neste momento?".
        """
        from apps.appointments.models import Appointment

        candidatas = Appointment.objects.filter(
            room__clinic=clinic,
            room__isnull=False,
            status__in=[
                Appointment.Status.SCHEDULED,
                Appointment.Status.RESCHEDULED,
            ],
        )
        if start == end:
            # Intervalo instantaneo: a consulta precisa estar acontecendo.
            candidatas = candidatas.filter(scheduled_at__lte=start)
        else:
            candidatas = candidatas.filter(scheduled_at__lt=end)

        return {
            appointment.room_id
            for appointment in candidatas.only(
                'room_id', 'scheduled_at', 'duration_minutes'
            )
            if appointment.ends_at > start
        }
