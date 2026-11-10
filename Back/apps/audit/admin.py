from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = [
        'created_at',
        'action',
        'actor_email',
        'actor_role',
        'clinic',
        'target_model',
        'target_id',
    ]
    list_filter = ['action', 'actor_role', 'clinic', 'created_at']
    search_fields = [
        'actor_email',
        'target_model',
        'target_id',
        'target_repr',
        'request_path',
    ]
    readonly_fields = [
        'id',
        'actor',
        'actor_email',
        'actor_role',
        'clinic',
        'action',
        'target_model',
        'target_id',
        'target_repr',
        'request_method',
        'request_path',
        'ip_address',
        'user_agent',
        'metadata',
        'created_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.is_staff

    def has_change_permission(self, request, obj=None):
        return False
