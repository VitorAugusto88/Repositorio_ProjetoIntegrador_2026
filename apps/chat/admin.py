from django.contrib import admin
from .models import ChatMessage, Presence


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'receiver', 'message_type', 'read', 'sent_at']
    list_filter = ['message_type', 'read']
    search_fields = ['sender__full_name', 'receiver__full_name']
    ordering = ['-sent_at']


@admin.register(Presence)
class PresenceAdmin(admin.ModelAdmin):
    list_display = ['user', 'is_online', 'connection_count', 'last_seen']
    list_filter = ['is_online']
    search_fields = ['user__full_name', 'user__email']
    ordering = ['-last_seen']