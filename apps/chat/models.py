import uuid
from django.db import models


class ChatMessage(models.Model):
    """
    Mensagem do chat entre paciente e psicólogo.
    content_encrypted: o frontend criptografa antes de enviar.
    O servidor armazena sem conhecer o conteúdo real.
    """

    class MessageType(models.TextChoices):
        TEXT = 'text', 'Texto'
        IMAGE = 'image', 'Imagem'
        AUDIO = 'audio', 'Áudio'
        FILE = 'file', 'Arquivo'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='sent_messages'
    )
    receiver = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='received_messages'
    )
    appointment = models.ForeignKey(
        'appointments.Appointment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='messages',
        help_text='Contexto da consulta (opcional)'
    )

    content_encrypted = models.TextField(help_text='Conteúdo criptografado pelo frontend')
    message_type = models.CharField(max_length=10, choices=MessageType.choices, default=MessageType.TEXT)
    media_url = models.URLField(blank=True, help_text='URL do arquivo de mídia no storage')

    read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Mensagem'
        ordering = ['sent_at']

    def __str__(self):
        return f'{self.sender} → {self.receiver} ({self.sent_at:%d/%m %H:%M})'
