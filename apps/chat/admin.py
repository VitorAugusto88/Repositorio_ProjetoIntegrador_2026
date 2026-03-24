from django.contrib import admin
from .models import ChatMessage


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'receiver', 'message_type', 'read', 'sent_at']
    list_filter = ['message_type', 'read']
    search_fields = ['sender__full_name', 'receiver__full_name']
    ordering = ['-sent_at']