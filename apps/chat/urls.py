from django.urls import path

from . import views


urlpatterns = [
    path('messages/', views.ChatMessageListCreateView.as_view(), name='chat-messages'),
    path('messages/read/', views.ChatConversationReadView.as_view(), name='chat-read-conversation'),
    path('messages/<uuid:pk>/read/', views.ChatMessageReadView.as_view(), name='chat-read'),
    path('unread/', views.UnreadCountView.as_view(), name='chat-unread'),
    path('conversations/', views.ConversationListView.as_view(), name='chat-conversations'),
    path('contacts/', views.ChatContactListView.as_view(), name='chat-contacts'),
]
