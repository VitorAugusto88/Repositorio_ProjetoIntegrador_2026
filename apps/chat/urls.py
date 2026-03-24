from django.urls import path
from . import views

urlpatterns = [
    # Mensagens
    path('messages/', views.ChatMessageListCreateView.as_view(), name='chat-messages'),
    path('messages/<uuid:pk>/read/', views.ChatMessageReadView.as_view(), name='chat-read'),

    # Utilitários
    path('unread/', views.UnreadCountView.as_view(), name='chat-unread'),
    path('conversations/', views.ConversationListView.as_view(), name='chat-conversations'),
]

#GET /api/chat/messages/?with=<id> → conversa com uma pessoa
#POST /api/chat/messages/ → envia mensagem
#PATCH /api/chat/messages/<id>/read/ → marca como lida
#GET /api/chat/unread/ → quantas não lidas
#GET /api/chat/conversations/