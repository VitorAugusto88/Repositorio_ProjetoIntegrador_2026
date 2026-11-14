from pathlib import Path

from rest_framework import serializers

from .models import ChatMessage
from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer, get_user_photo_url
from apps.uploads import DOCUMENT_EXTENSIONS, validate_signature

MAX_CHAT_ATTACHMENT_SIZE = 20 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm"}
# Documentos aceitos no chat — os mesmos permitidos no modulo de documentos
# (apps/records), para o usuario nao precisar sair do chat para mandar um
# exame/laudo. As imagens da lista acima cobrem a parte visual, entao aqui
# ficam so os formatos de texto/documento.
CHAT_DOCUMENT_EXTENSIONS = DOCUMENT_EXTENSIONS - IMAGE_EXTENSIONS


def user_initials(user):
    names = (user.full_name or user.email).strip().split()
    if not names:
        return ""
    if len(names) == 1:
        return names[0][:2].upper()
    return f"{names[0][0]}{names[-1][0]}".upper()


def users_can_chat(sender, receiver):
    if sender == receiver:
        return False

    if not sender.clinic_id or sender.clinic_id != receiver.clinic_id:
        return False

    if sender.is_admin:
        return receiver.is_patient or receiver.is_professional

    if receiver.is_admin:
        return sender.is_patient or sender.is_professional

    if sender.is_patient and receiver.is_professional:
        return True

    if sender.is_professional and receiver.is_patient:
        return True

    return False


def appointment_matches_chat(appointment, sender, receiver):
    if (
        appointment.clinic_id != sender.clinic_id
        or appointment.clinic_id != receiver.clinic_id
    ):
        return False

    participants = {appointment.patient.user_id, appointment.professional.user_id}
    chat_users = {sender.id, receiver.id}

    if sender.is_admin or receiver.is_admin:
        other = receiver if sender.is_admin else sender
        return other.id in participants

    return chat_users == participants


class ChatContactSerializer(serializers.ModelSerializer):
    initials = serializers.SerializerMethodField()
    online = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "full_name", "role", "initials", "online", "photo_url"]

    def get_initials(self, obj):
        return user_initials(obj)

    def get_photo_url(self, obj):
        return get_user_photo_url(obj, self.context.get("request"))

    def get_online(self, obj):
        from .presence import is_user_online
        return is_user_online(obj.id)


class ChatMessageSerializer(serializers.ModelSerializer):
    """
    Serializer de mensagens do chat.
    O campo content_encrypted pode receber texto criptografado pelo frontend.
    """

    sender_detail = UserSerializer(source="sender", read_only=True)
    receiver_detail = UserSerializer(source="receiver", read_only=True)
    attachment = serializers.FileField(
        required=False,
        allow_empty_file=False,
        write_only=True,
    )
    media_url = serializers.CharField(read_only=True)
    media_name = serializers.CharField(read_only=True)

    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "sender",
            "receiver",
            "appointment",
            "content_encrypted",
            "message_type",
            "attachment",
            "media_url",
            "media_name",
            "media_duration_ms",
            "read",
            "sent_at",
            "sender_detail",
            "receiver_detail",
        ]
        read_only_fields = [
            "id", "sent_at", "sender", "read", "media_url", "media_name",
        ]

    def validate(self, data):
        request = self.context["request"]
        sender = request.user
        receiver = data.get("receiver")
        appointment = data.get("appointment")
        attachment = data.get("attachment")
        message_type = data.get("message_type", ChatMessage.MessageType.TEXT)
        content_encrypted = data.get("content_encrypted", "")

        if not receiver:
            raise serializers.ValidationError("Destinatario e obrigatorio.")

        if receiver == sender:
            raise serializers.ValidationError(
                "Voce nao pode enviar mensagens para si mesmo."
            )

        if not users_can_chat(sender, receiver):
            raise serializers.ValidationError(
                "Voce nao pode enviar mensagens para este usuario."
            )

        if appointment and not appointment_matches_chat(appointment, sender, receiver):
            raise serializers.ValidationError(
                "A consulta informada nao pertence a esta conversa."
            )

        if attachment:
            data["message_type"] = self._validate_attachment_type(
                attachment,
                message_type,
            )
            # Nome original do arquivo — o storage renomeia o arquivo salvo.
            data["media_name"] = Path(attachment.name).name[:255]
        elif message_type != ChatMessage.MessageType.TEXT:
            raise serializers.ValidationError(
                "Anexo obrigatorio para mensagens de imagem, audio ou arquivo."
            )
        elif not content_encrypted:
            raise serializers.ValidationError(
                "content_encrypted e obrigatorio para mensagens de texto."
            )

        return data

    def _validate_attachment_type(self, attachment, message_type):
        if attachment.size > MAX_CHAT_ATTACHMENT_SIZE:
            raise serializers.ValidationError("O anexo deve ter no maximo 20MB.")

        extension = Path(attachment.name).suffix.lower()
        allowed_extensions = (
            IMAGE_EXTENSIONS | AUDIO_EXTENSIONS | CHAT_DOCUMENT_EXTENSIONS
        )

        if extension not in allowed_extensions:
            raise serializers.ValidationError(
                "Formato de anexo nao permitido. Use imagem, audio, "
                "PDF, DOC ou DOCX."
            )

        if extension in IMAGE_EXTENSIONS:
            inferred_type = ChatMessage.MessageType.IMAGE
        elif extension in AUDIO_EXTENSIONS:
            inferred_type = ChatMessage.MessageType.AUDIO
        else:
            inferred_type = ChatMessage.MessageType.FILE

        # Confere se o conteudo bate com a extensao (imagens e documentos;
        # audio nao tem assinatura na tabela e passa direto).
        validate_signature(attachment, extension)

        if message_type not in [ChatMessage.MessageType.TEXT, inferred_type]:
            raise serializers.ValidationError(
                "message_type nao corresponde ao tipo do arquivo."
            )

        return inferred_type
