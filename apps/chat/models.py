import uuid

from django.db import models


class ChatMessage(models.Model):
    """
    Mensagem do chat entre paciente e profissional.
    content_encrypted: o frontend criptografa antes de enviar.
    O servidor armazena sem conhecer o conteudo real.
    """

    class MessageType(models.TextChoices):
        TEXT = 'text', 'Texto'
        IMAGE = 'image', 'Imagem'
        AUDIO = 'audio', 'Audio'
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
        null=True,
        blank=True,
        related_name='messages',
        help_text='Contexto da consulta (opcional)'
    )

    content_encrypted = models.TextField(
        blank=True,
        help_text='Conteudo criptografado pelo frontend'
    )
    message_type = models.CharField(
        max_length=10,
        choices=MessageType.choices,
        default=MessageType.TEXT
    )
    attachment = models.FileField(
        upload_to='chat/attachments/%Y/%m/',
        null=True,
        blank=True
    )
    media_url = models.CharField(
        max_length=500,
        blank=True,
        help_text='URL do arquivo de midia no storage'
    )

    read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Mensagem'
        ordering = ['sent_at']

    def __str__(self):
        return f'{self.sender} -> {self.receiver} ({self.sent_at:%d/%m %H:%M})'

    def save(self, *args, **kwargs):
        # O super().save() aplica o upload_to e define o nome final do arquivo;
        # so depois disso o attachment.url aponta para o caminho real. Calcular
        # a media_url antes gravava o nome cru (sem chat/attachments/AAAA/MM/),
        # gerando 404 ao abrir a imagem/audio no frontend.
        super().save(*args, **kwargs)
        correct_url = self.attachment.url if self.attachment else ''
        if self.media_url != correct_url:
            self.media_url = correct_url
            super().save(update_fields=['media_url'])
