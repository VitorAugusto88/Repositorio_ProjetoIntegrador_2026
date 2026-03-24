# Views da Fase 2
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q
from .models import ChatMessage
from .serializers import ChatMessageSerializer, ChatMessageReadSerializer


class ChatMessageListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/chat/messages/?with=<user_id>
    Lista as mensagens da conversa entre dois usuários.
    O parâmetro "with" é o ID do outro usuário da conversa.

    POST /api/chat/messages/
    Envia uma nova mensagem.
    """
    serializer_class = ChatMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        other_user_id = self.request.query_params.get('with')

        if other_user_id:
            # Busca mensagens entre os dois usuários nos dois sentidos
            return ChatMessage.objects.filter(
                Q(sender=user, receiver__id=other_user_id) |
                Q(sender__id=other_user_id, receiver=user)
            ).order_by('sent_at')

        # Sem filtro: retorna todas as conversas do usuário
        return ChatMessage.objects.filter(
            Q(sender=user) | Q(receiver=user)
        ).order_by('sent_at')

    def perform_create(self, serializer):
        # O remetente é sempre o usuário logado
        serializer.save(sender=self.request.user)


class ChatMessageReadView(APIView):
    """
    PATCH /api/chat/messages/<id>/read/
    Marca uma mensagem como lida.
    Só o destinatário pode marcar como lida.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        message = get_object_or_404(ChatMessage, pk=pk, receiver=request.user)
        message.read = True
        message.save()
        return Response({'mensagem': 'Marcada como lida.'})


class UnreadCountView(APIView):
    """
    GET /api/chat/unread/
    Retorna o número de mensagens não lidas.
    Útil para mostrar o badge de notificação no ícone do chat.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = ChatMessage.objects.filter(
            receiver=request.user,
            read=False
        ).count()
        return Response({'unread_count': count})


class ConversationListView(APIView):
    """
    GET /api/chat/conversations/
    Lista todas as conversas ativas do usuário —
    uma entrada por pessoa com quem trocou mensagens,
    mostrando a última mensagem de cada conversa.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # Pega todos os usuários com quem trocou mensagens
        mensagens = ChatMessage.objects.filter(
            Q(sender=user) | Q(receiver=user)
        ).order_by('-sent_at')

        # Monta lista de conversas sem repetir o mesmo usuário
        conversas = {}
        for msg in mensagens:
            other = msg.receiver if msg.sender == user else msg.sender
            if other.id not in conversas:
                conversas[other.id] = {
                    'user_id': str(other.id),
                    'user_name': other.full_name,
                    'last_message': msg.sent_at,
                    'unread': ChatMessage.objects.filter(
                        sender=other,
                        receiver=user,
                        read=False
                    ).count()
                }

        return Response(list(conversas.values()))