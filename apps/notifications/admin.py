from django.contrib import admin

from .models import DeviceToken, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = [
        'user', 'type', 'channel', 'status', 'is_read', 'sent_at', 'created_at'
    ]
    list_filter = ['type', 'channel', 'status', 'is_read']
    search_fields = ['user__email', 'user__full_name', 'title', 'body']
    ordering = ['-created_at']


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ['user', 'platform', 'is_active', 'created_at', 'last_used_at']
    list_filter = ['platform', 'is_active']
    search_fields = ['user__email', 'user__full_name', 'token']
    ordering = ['-created_at']
