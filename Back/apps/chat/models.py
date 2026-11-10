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
    media_name = models.CharField(
        max_length=255,
        blank=True,
        help_text=(
            'Nome original do arquivo enviado. Guardado porque o storage '
            'renomeia o arquivo (sufixo anticolisao), e o chat precisa exibir '
            'o nome real nos anexos de documento (PDF/DOC/DOCX).'
        ),
    )
    media_duration_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            'Duracao real do audio em ms, medida na gravacao. Persistida porque '
            'o webm do MediaRecorder (web) nao carrega duracao nos metadados e '
            'o navegador a reporta errada.'
        ),
    )

    read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    # Exclusao "so para mim": cada lado pode ocultar a mensagem sem afetar o
    # outro. Quando os dois lados ocultam, a linha e removida de vez (limpeza).
    # A exclusao "para todos" (so pelo remetente, enquanto nao lida) apaga a
    # linha diretamente.
    deleted_for_sender = models.BooleanField(default=False)
    deleted_for_receiver = models.BooleanField(default=False)

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


class Presence(models.Model):
    """
    Presenca online de um usuario, derivada das conexoes WebSocket do chat.

    connection_count e incrementado a cada connect e decrementado a cada
    disconnect (um usuario pode ter varias abas/aparelhos). is_online = ha
    ao menos uma conexao viva. Serve como fonte de verdade para:
      - o campo 'online' das conversas/contatos (antes hardcoded como False);
      - a decisao de mandar push de chat so quando o destinatario esta offline.
    """

    user = models.OneToOneField(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='presence',
        primary_key=True,
    )
    connection_count = models.PositiveIntegerField(default=0)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Presenca'
        verbose_name_plural = 'Presencas'

    def __str__(self):
        return f'{self.user} ({"online" if self.is_online else "offline"})'
