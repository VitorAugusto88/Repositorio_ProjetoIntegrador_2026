from rest_framework.permissions import BasePermission


class IsAdminOrSelf(BasePermission):
    """Permite acesso ao proprio objeto ou a admins da mesma clinica."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser:
            return True

        if hasattr(obj, 'user'):
            if user.is_admin:
                return obj.user.clinic_id == user.clinic_id
            return obj.user == user

        if user.is_admin:
            return getattr(obj, 'clinic_id', None) == user.clinic_id

        return obj == user


class IsProfessionalOrAdmin(BasePermission):
    """Apenas psicologos e admins."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_professional or request.user.is_admin or request.user.is_superuser
        )


class IsAdminOnly(BasePermission):
    """Apenas admins da clinica."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsPlatformAdmin(BasePermission):
    """Apenas superusuarios da plataforma."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class IsSameClinic(BasePermission):
    """Garante que o usuario so acessa dados da propria clinica."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        obj_clinic = getattr(obj, 'clinic_id', None)
        return obj_clinic == request.user.clinic_id
