from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = [
        'user', 'type', 'channel', 'status', 'is_read', 'sent_at', 'created_at'
    ]
    list_filter = ['type', 'channel', 'status', 'is_read']
    search_fields = ['user__email', 'user__full_name', 'title', 'body']
    ordering = ['-created_at']
