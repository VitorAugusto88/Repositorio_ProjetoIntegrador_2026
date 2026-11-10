from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatMessage
from .presence import is_user_online
from .serializers import (
    ChatContactSerializer,
    ChatMessageSerializer,
    user_initials,
    users_can_chat,
)
from .realtime import (
    broadcast_chat_event,
    conversation_group_name,
    serialize_message_for_event,
)
from apps.accounts.models import User


def format_chat_contact(user):
    return {
        'id': str(user.id),
        'full_name': user.full_name,
        'role': user.role,
        'initials': user_initials(user),
        'online': is_user_online(user.id),
    }


def format_message_summary(message):
    return {
        'id': str(message.id),
        'content_encrypted': message.content_encrypted,
        'message_type': message.message_type,
        'media_url': message.media_url,
        'media_name': message.media_name,
        'sender_id': str(message.sender_id),
        'receiver_id': str(message.receiver_id),
        'read': message.read,
        'sent_at': message.sent_at,
    }


def exclude_hidden_for(queryset, user):
    """Remove da lista as mensagens que o usuario logado ocultou (exclusao so
    para mim). Nao afeta o que o outro lado ve."""
    return queryset.exclude(
        Q(sender=user, deleted_for_sender=True)
        | Q(receiver=user, deleted_for_receiver=True)
    )


def _delete_message_file(message):
    """Remove o anexo fisico/remoto da mensagem, ignorando arquivos ja
    inexistentes ou storage indisponivel."""
    try:
        if message.attachment:
            message.attachment.delete(save=False)
    except Exception:
        pass


def _hide_messages_for(queryset, user):
    """Oculta todas as mensagens do queryset para o usuario logado e remove de
    vez as que os dois lados ja ocultaram."""
    queryset.filter(sender=user).update(deleted_for_sender=True)
    queryset.filter(receiver=user).update(deleted_for_receiver=True)

    both_hidden = queryset.filter(
        deleted_for_sender=True,
        deleted_for_receiver=True,
    )
    for message in both_hidden:
        _delete_message_file(message)
    both_hidden.delete()


def get_allowed_contact_queryset(user):
    if not user.clinic_id:
        return User.objects.none()

    base_qs = User.objects.filter(
        clinic_id=user.clinic_id,
        is_active=True,
    ).exclude(id=user.id)

    if user.is_admin:
        return base_qs.filter(role__in=[User.Role.PATIENT, User.Role.PROFESSIONAL])

    admin_q = Q(role=User.Role.ADMIN)

    if user.is_patient:
        return base_qs.filter(admin_q | Q(role=User.Role.PROFESSIONAL))

    if user.is_professional:
        return base_qs.filter(admin_q | Q(role=User.Role.PATIENT))

    return User.objects.none()


class ChatMessageListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/chat/messages/?with=<user_id>
    Lista as mensagens da conversa entre dois usuarios.

    POST /api/chat/messages/
    Envia uma nova mensagem.
    """
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        other_user_id = self.request.query_params.get('with')

        queryset = exclude_hidden_for(
            ChatMessage.objects.filter(Q(sender=user) | Q(receiver=user)),
            user,
        ).select_related('sender', 'receiver', 'appointment').order_by('sent_at')

        if not other_user_id:
            return queryset

        other_user = get_object_or_404(User, pk=other_user_id)
        if not users_can_chat(user, other_user):
            raise PermissionDenied('Voce nao pode acessar esta conversa.')

        return queryset.filter(
            Q(sender=user, receiver=other_user) |
            Q(sender=other_user, receiver=user)
        )

    def perform_create(self, serializer):
        message = serializer.save(sender=self.request.user)
        broadcast_chat_event(
            conversation_group_name(message.sender_id, message.receiver_id),
            'message.new',
            serialize_message_for_event(message),
        )


class ChatMessageReadView(APIView):
    """
    PATCH /api/chat/messages/<id>/read/
    Marca uma mensagem como lida.
    So o destinatario pode marcar como lida.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        message = get_object_or_404(ChatMessage, pk=pk, receiver=request.user)
        message.read = True
        message.save(update_fields=['read'])
        broadcast_chat_event(
            conversation_group_name(message.sender_id, message.receiver_id),
            'message.read',
            {
                'id': str(message.id),
                'reader': str(request.user.id),
                'read': True,
            },
        )
        return Response({'mensagem': 'Marcada como lida.'})


class ChatConversationReadView(APIView):
    """
    PATCH /api/chat/messages/read/?with=<user_id>
    Marca como lidas todas as mensagens recebidas de uma conversa.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        user = request.user
        other_user_id = request.query_params.get('with')

        if not other_user_id:
            raise ValidationError({'with': 'Informe o usuario da conversa.'})

        other_user = get_object_or_404(User, pk=other_user_id)
        if not users_can_chat(user, other_user):
            raise PermissionDenied('Voce nao pode acessar esta conversa.')

        updated = ChatMessage.objects.filter(
            sender=other_user,
            receiver=user,
            read=False,
        ).update(read=True)

        broadcast_chat_event(
            conversation_group_name(user.id, other_user.id),
            'message.read',
            {
                'reader': str(user.id),
                'sender': str(other_user.id),
                'marked_read': updated,
            },
        )

        return Response({'marked_read': updated})


class ChatMessageDeleteView(APIView):
    """
    DELETE /api/chat/messages/<id>/?for_everyone=true
    Apaga uma mensagem.
      - for_everyone=true: so o remetente pode, e so enquanto nao lida. Remove
        a linha para os dois lados e avisa em tempo real (message.deleted).
      - caso contrario: oculta so para o usuario logado (o outro mantem).
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        user = request.user
        message = get_object_or_404(
            ChatMessage.objects.filter(Q(sender=user) | Q(receiver=user)),
            pk=pk,
        )

        for_everyone = str(
            request.query_params.get('for_everyone', '')
        ).lower() in ('true', '1', 'yes')

        if for_everyone:
            if message.sender_id != user.id:
                raise PermissionDenied('Apenas quem enviou pode apagar para todos.')
            if message.read:
                raise ValidationError(
                    {'detail': 'A mensagem ja foi lida; so e possivel apagar para voce.'}
                )
            group = conversation_group_name(message.sender_id, message.receiver_id)
            message_id = str(message.id)
            _delete_message_file(message)
            message.delete()
            broadcast_chat_event(group, 'message.deleted', {'id': message_id})
            return Response({'deleted': 'everyone'})

        # Exclusao so para mim.
        if message.sender_id == user.id:
            message.deleted_for_sender = True
        if message.receiver_id == user.id:
            message.deleted_for_receiver = True

        if message.deleted_for_sender and message.deleted_for_receiver:
            _delete_message_file(message)
            message.delete()
        else:
            message.save(update_fields=['deleted_for_sender', 'deleted_for_receiver'])

        return Response({'deleted': 'me'})


class ChatClearConversationView(APIView):
    """
    DELETE /api/chat/messages/clear/?with=<user_id>
    Apaga a conversa com um usuario apenas para o usuario logado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        other_user_id = request.query_params.get('with')
        if not other_user_id:
            raise ValidationError({'with': 'Informe o usuario da conversa.'})

        other_user = get_object_or_404(User, pk=other_user_id)
        queryset = ChatMessage.objects.filter(
            Q(sender=user, receiver=other_user)
            | Q(sender=other_user, receiver=user)
        )
        _hide_messages_for(queryset, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatClearAllView(APIView):
    """
    DELETE /api/chat/messages/clear-all/
    Apaga todas as mensagens de todas as conversas apenas para o usuario logado.
    O outro lado de cada conversa mantem as mensagens.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        queryset = ChatMessage.objects.filter(Q(sender=user) | Q(receiver=user))
        _hide_messages_for(queryset, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnreadCountView(APIView):
    """
    GET /api/chat/unread/
    Retorna o numero de mensagens nao lidas.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = ChatMessage.objects.filter(
            receiver=request.user,
            read=False,
            deleted_for_receiver=False,
        ).count()
        return Response({'unread_count': count})


class ConversationListView(APIView):
    """
    GET /api/chat/conversations/
    Lista uma entrada por pessoa com quem o usuario trocou mensagens.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        messages = exclude_hidden_for(
            ChatMessage.objects.filter(Q(sender=user) | Q(receiver=user)),
            user,
        ).select_related('sender', 'receiver').order_by('-sent_at')

        unread_by_sender = {
            str(row['sender_id']): row['count']
            for row in ChatMessage.objects.filter(
                receiver=user, read=False, deleted_for_receiver=False,
            )
            .values('sender_id')
            .annotate(count=Count('id'))
        }

        conversations = {}
        for message in messages:
            other = message.receiver if message.sender_id == user.id else message.sender

            if other.id in conversations:
                continue

            if not users_can_chat(user, other):
                continue

            unread = unread_by_sender.get(str(other.id), 0)

            conversations[other.id] = {
                'user_id': str(other.id),
                'user_name': other.full_name,
                'contact': format_chat_contact(other),
                'last_message': format_message_summary(message),
                'last_message_text': message.content_encrypted,
                'last_message_at': message.sent_at,
                'unread': unread,
                'unread_count': unread,
            }

        return Response(list(conversations.values()))


class ChatPresenceView(APIView):
    """
    GET /api/chat/presence/?with=<user_id>
    Retorna se o outro usuario da conversa esta online (fonte: modelo Presence,
    alimentado pelas conexoes WebSocket e persistido no banco compartilhado).
    O frontend usa isto para exibir Online/Ausente de forma confiavel mesmo
    quando os eventos de presenca em tempo real nao chegam.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        other_user_id = request.query_params.get('with')
        if not other_user_id:
            raise ValidationError({'with': 'Informe o usuario da conversa.'})

        other_user = get_object_or_404(User, pk=other_user_id)
        if not users_can_chat(request.user, other_user):
            raise PermissionDenied('Voce nao pode acessar esta conversa.')

        return Response({'online': is_user_online(other_user.id)})


class ChatContactListView(APIView):
    """
    GET /api/chat/contacts/
    Lista usuarios com quem o usuario logado pode iniciar conversa.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        contacts = get_allowed_contact_queryset(request.user).order_by('full_name')
        serializer = ChatContactSerializer(contacts, many=True)
        return Response(serializer.data)
