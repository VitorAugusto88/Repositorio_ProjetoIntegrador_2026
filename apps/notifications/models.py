import uuid
from django.db import models


class Notification(models.Model):

    class Type(models.TextChoices):
        APPOINTMENT_REMINDER = 'appointment_reminder', 'Lembrete de consulta'
        APPOINTMENT_CONFIRMED = 'appointment_confirmed', 'Consulta confirmada'
        APPOINTMENT_CANCELLED = 'appointment_cancelled', 'Consulta cancelada'
        APPOINTMENT_RESCHEDULED = 'appointment_rescheduled', 'Consulta remarcada'
        NEW_MESSAGE = 'new_message', 'Nova mensagem'
        GENERAL = 'general', 'Geral'

    class Channel(models.TextChoices):
        IN_APP = 'in_app', 'In-app'
        EMAIL = 'email', 'Email'
        SMS = 'sms', 'SMS'
        PUSH = 'push', 'Push'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pendente'
        SENT = 'sent', 'Enviada'
        FAILED = 'failed', 'Falhou'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    type = models.CharField(max_length=30, choices=Type.choices)
    channel = models.CharField(max_length=10, choices=Channel.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    title = models.CharField(max_length=200)
    body = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Notificação'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.type} → {self.user} ({self.status})'


class DeviceToken(models.Model):
    """
    "Endereco" de push de um aparelho do usuario (ExpoPushToken).
    Um usuario pode ter varios (celular Android, iPhone, etc.).
    O envio de push (tasks.send_firebase_push_notification) busca os tokens
    ativos e dispara via Expo Push Service.
    """

    class Platform(models.TextChoices):
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'
        WEB = 'web', 'Web'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='device_tokens',
    )
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Token de dispositivo'
        verbose_name_plural = 'Tokens de dispositivo'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.platform} · {self.user} ({"ativo" if self.is_active else "inativo"})'
