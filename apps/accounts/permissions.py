from rest_framework.permissions import BasePermission


class IsAdminOrSelf(BasePermission):
    """Permite acesso ao próprio objeto ou a admins."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_admin:
            return True
        # obj pode ser PatientProfile — checa user_id
        if hasattr(obj, 'user'):
            return obj.user == user
        return obj == user


class IsProfessionalOrAdmin(BasePermission):
    """Apenas psicólogos e admins."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_professional or request.user.is_admin
        )


class IsAdminOnly(BasePermission):
    """Apenas admins da clínica."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class IsSameClinic(BasePermission):
    """Garante que o usuário só acessa dados da própria clínica."""

    def has_object_permission(self, request, view, obj):
        if request.user.is_admin:
            return True
        obj_clinic = getattr(obj, 'clinic_id', None)
        return obj_clinic == request.user.clinic_id
