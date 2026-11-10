from django.urls import path

from . import views


urlpatterns = [
    path('messages/', views.ChatMessageListCreateView.as_view(), name='chat-messages'),
    path('messages/clear-all/', views.ChatClearAllView.as_view(), name='chat-clear-all'),
    path('messages/clear/', views.ChatClearConversationView.as_view(), name='chat-clear-conversation'),
    path('messages/read/', views.ChatConversationReadView.as_view(), name='chat-read-conversation'),
    path('messages/<uuid:pk>/read/', views.ChatMessageReadView.as_view(), name='chat-read'),
    path('messages/<uuid:pk>/', views.ChatMessageDeleteView.as_view(), name='chat-message-delete'),
    path('unread/', views.UnreadCountView.as_view(), name='chat-unread'),
    path('conversations/', views.ConversationListView.as_view(), name='chat-conversations'),
    path('presence/', views.ChatPresenceView.as_view(), name='chat-presence'),
    path('contacts/', views.ChatContactListView.as_view(), name='chat-contacts'),
]
