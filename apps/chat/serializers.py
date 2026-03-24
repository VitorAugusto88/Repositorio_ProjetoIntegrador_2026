from rest_framework import serializers
from .models import ChatMessage
from apps.accounts.serializers import UserSerializer


class ChatMessageSerializer(serializers.ModelSerializer):
    """
    Serializer de mensagens do chat.
    O conteúdo chega criptografado do frontend —
    o backend só armazena, nunca lê o conteúdo real.
    """
    sender_detail = UserSerializer(source='sender', read_only=True)

    class Meta:
        model = ChatMessage
        fields = [
            'id', 'sender', 'receiver', 'appointment',
            'content_encrypted', 'message_type', 'media_url',
            'read', 'sent_at', 'sender_detail'
        ]
        read_only_fields = ['id', 'sent_at', 'sender']

    def validate(self, data):
        # Não pode mandar mensagem para si mesmo
        if data.get('receiver') == self.context['request'].user:
            raise serializers.ValidationError(
                'Você não pode enviar mensagens para si mesmo.'
            )
        return data


class ChatMessageReadSerializer(serializers.ModelSerializer):
    """
    Serializer exclusivo para marcar mensagem como lida.
    Só atualiza o campo read.
    """
    class Meta:
        model = ChatMessage
        fields = ['read']