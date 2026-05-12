import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.core.validators import validate_ipv46_address

from apps.accounts.permissions import get_object_clinic_id

from .middleware import get_current_request
from .models import AuditLog


SENSITIVE_METADATA_KEYS = {
    'password',
    'token',
    'access',
    'refresh',
    'secret',
    'authorization',
    'notes',
    'anamnesis',
    'medical_history',
}


def log_audit_event(
    *,
    action,
    target=None,
    target_model=None,
    target_id=None,
    target_repr='',
    actor=None,
    clinic=None,
    metadata=None,
    request=None,
):
    request = request or get_current_request()
    actor = actor or _request_actor(request)
    clinic_id = _resolve_clinic_id(clinic, target, actor)
    target_model = target_model or _target_model(target)
    target_id = target_id or _target_id(target)
    target_repr = target_repr or _safe_str(target)

    return AuditLog.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        actor_email=getattr(actor, 'email', '') or '',
        actor_role=getattr(actor, 'role', '') or '',
        clinic_id=clinic_id,
        action=action,
        target_model=target_model,
        target_id=target_id,
        target_repr=target_repr[:255],
        request_method=getattr(request, 'method', '') if request else '',
        request_path=getattr(request, 'path', '')[:500] if request else '',
        ip_address=get_client_ip(request),
        user_agent=_user_agent(request),
        metadata=_clean_metadata(metadata or {}),
    )


def model_field_snapshot(instance, fields):
    return {
        field: getattr(instance, field, None)
        for field in fields
    }


def changed_model_fields(before, instance, fields):
    return [
        field
        for field in fields
        if before.get(field) != getattr(instance, field, None)
    ]


def get_client_ip(request):
    if request is None:
        return None

    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded_for:
        return _valid_ip_or_none(forwarded_for.split(',')[0].strip())

    return _valid_ip_or_none(request.META.get('REMOTE_ADDR') or None)


def _request_actor(request):
    if request is None:
        return None
    return getattr(request, 'user', None)


def _resolve_clinic_id(clinic, target, actor):
    if clinic is not None:
        return getattr(clinic, 'id', clinic)

    if target is not None:
        clinic_id = get_object_clinic_id(target)
        if clinic_id:
            return clinic_id

    return getattr(actor, 'clinic_id', None)


def _target_model(target):
    if target is None:
        return ''
    return target.__class__.__name__


def _target_id(target):
    if target is None:
        return ''
    return str(getattr(target, 'pk', '') or '')


def _safe_str(target):
    if target is None:
        return ''
    return str(target)


def _user_agent(request):
    if request is None:
        return ''
    return request.META.get('HTTP_USER_AGENT', '')[:1000]


def _clean_metadata(metadata):
    cleaned = {}
    for key, value in metadata.items():
        key_text = str(key)
        if key_text.lower() in SENSITIVE_METADATA_KEYS:
            cleaned[key_text] = '[redacted]'
        else:
            cleaned[key_text] = value

    return json.loads(json.dumps(cleaned, cls=DjangoJSONEncoder, default=str))


def _valid_ip_or_none(value):
    if not value:
        return None

    try:
        validate_ipv46_address(value)
    except DjangoValidationError:
        return None

    return value
