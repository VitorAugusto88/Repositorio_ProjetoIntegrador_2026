from rest_framework.permissions import BasePermission


def get_object_clinic_id(obj):
    """
    Resolve o clinic_id de objetos comuns do dominio sem acoplar a permissao
    a um model especifico.
    """
    clinic_id = getattr(obj, 'clinic_id', None)
    if clinic_id:
        return clinic_id

    if obj.__class__.__name__ == 'Clinic':
        return getattr(obj, 'id', None)

    user = getattr(obj, 'user', None)
    if user is not None:
        return getattr(user, 'clinic_id', None)

    professional = getattr(obj, 'professional', None)
    if professional is not None and getattr(professional, 'user', None) is not None:
        return professional.user.clinic_id

    patient = getattr(obj, 'patient', None)
    if patient is not None and getattr(patient, 'user', None) is not None:
        return patient.user.clinic_id

    appointment = getattr(obj, 'appointment', None)
    if appointment is not None:
        return getattr(appointment, 'clinic_id', None)

    return None


def is_same_clinic(user, obj):
    if user.is_superuser:
        return True
    user_clinic_id = getattr(user, 'clinic_id', None)
    return user_clinic_id is not None and get_object_clinic_id(obj) == user_clinic_id


class IsAdminOrSelf(BasePermission):
    """Permite acesso ao proprio objeto ou a admins da mesma clinica."""

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser:
            return True

        if hasattr(obj, 'user'):
            if obj.user_id == user.id:
                return True
            if user.is_admin:
                return is_same_clinic(user, obj)
            return False

        if obj == user:
            return True

        if user.is_admin:
            return is_same_clinic(user, obj)

        return False


class IsProfessionalOrAdmin(BasePermission):
    """Apenas psicologos e admins."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_professional
            or request.user.is_admin
            or request.user.is_superuser
        )


class IsAdminOnly(BasePermission):
    """Apenas admins da clinica."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_admin or request.user.is_superuser
        )


class IsPlatformAdmin(BasePermission):
    """Apenas superusuarios da plataforma."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class IsSameClinic(BasePermission):
    """Garante que o usuario so acessa dados da propria clinica."""

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        return is_same_clinic(request.user, obj)


class IsPatientProfileInSameClinic(BasePermission):
    """
    Pacientes acessam o proprio perfil.
    Admins e profissionais acessam apenas pacientes da sua clinica.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.is_superuser:
            return True

        if obj.user_id == user.id:
            return True

        if not is_same_clinic(user, obj):
            return False

        return user.is_admin or user.is_professional


class IsProfessionalProfileOwnerOrClinicAdmin(BasePermission):
    """
    Profissionais acessam o proprio perfil.
    Admins acessam profissionais apenas da propria clinica.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_professional
            or request.user.is_admin
            or request.user.is_superuser
        )

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.is_superuser:
            return True

        if obj.user_id == user.id and user.is_professional:
            return True

        return user.is_admin and is_same_clinic(user, obj)


class CanManageAvailability(BasePermission):
    """
    Profissionais gerenciam apenas sua propria disponibilidade.
    Admins gerenciam apenas disponibilidade de profissionais da sua clinica.
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and (
            request.user.is_professional
            or request.user.is_admin
            or request.user.is_superuser
        )

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.is_superuser:
            return True

        if user.is_professional:
            return obj.professional.user_id == user.id

        if user.is_admin:
            return is_same_clinic(user, obj)

        return False
