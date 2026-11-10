from rest_framework import serializers

from .models import DeviceToken, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'channel', 'status', 'title', 'body',
            'metadata', 'is_read', 'read_at', 'sent_at', 'created_at',
        ]
        read_only_fields = fields


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ['token', 'platform', 'is_active', 'created_at', 'last_used_at']
        read_only_fields = ['is_active', 'created_at', 'last_used_at']
        # Sem UniqueValidator: o mesmo token pode reenviar (upsert na view) e ser
        # reatribuido a outro usuario sem estourar 400.
        extra_kwargs = {'token': {'validators': []}}
