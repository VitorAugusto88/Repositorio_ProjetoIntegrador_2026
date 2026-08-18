from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def send_email_notification(self, notification_id):
    notification = Notification.objects.select_related('user').get(pk=notification_id)

    send_mail(
        subject=notification.title,
        message=notification.body,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
        recipient_list=[notification.user.email],
        fail_silently=False,
    )

    notification.status = Notification.Status.SENT
    notification.sent_at = timezone.now()
    notification.save(update_fields=['status', 'sent_at'])
    return str(notification.id)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def send_firebase_push_notification(self, notification_id):
    """
    Envia a notificacao PUSH via Expo Push Service.

    Busca os DeviceToken ativos do usuario, dispara um envio em lote e trata
    tokens invalidos (DeviceNotRegistered -> is_active=False). So marca a
    notificacao como SENT se ao menos um envio deu certo.
    """
    from .models import DeviceToken
    from .push import send_expo_push

    notification = Notification.objects.select_related('user').get(pk=notification_id)

    if not getattr(settings, 'PUSH_ENABLED', False):
        notification.status = Notification.Status.PENDING
        notification.save(update_fields=['status'])
        return {'notification_id': str(notification.id), 'skipped': True}

    tokens = list(
        DeviceToken.objects.filter(user=notification.user, is_active=True)
    )
    if not tokens:
        notification.status = Notification.Status.FAILED
        notification.save(update_fields=['status'])
        return {'notification_id': str(notification.id), 'no_tokens': True}

    messages = [
        {
            'to': token.token,
            'title': notification.title,
            'body': notification.body,
            'data': notification.metadata or {},
            'sound': 'default',
        }
        for token in tokens
    ]
    tickets = send_expo_push(messages)

    any_ok = False
    now = timezone.now()
    for token, ticket in zip(tokens, tickets):
        ticket = ticket or {}
        if ticket.get('status') == 'ok':
            any_ok = True
            token.last_used_at = now
            token.save(update_fields=['last_used_at'])
            continue
        error = (ticket.get('details') or {}).get('error')
        if error == 'DeviceNotRegistered':
            token.is_active = False
            token.save(update_fields=['is_active'])

    if any_ok:
        notification.status = Notification.Status.SENT
        notification.sent_at = now
        notification.save(update_fields=['status', 'sent_at'])
    else:
        notification.status = Notification.Status.FAILED
        notification.save(update_fields=['status'])

    return {
        'notification_id': str(notification.id),
        'sent': any_ok,
        'tokens': len(tokens),
    }


# Janelas de lembrete: (horas antes da consulta, identificador do tipo).
# O reminder_kind vai no metadata para que a dedup trate cada disparo
# separadamente (o de "24h" nao impede o de "1h" e vice-versa).
REMINDER_WINDOWS = (
    (24, '24h'),
    (1, '1h'),
)


@shared_task
def send_upcoming_appointment_reminders():
    from apps.appointments.models import Appointment
    from .services import notify_appointment_reminder

    now = timezone.now()
    sent = 0

    for hours, kind in REMINDER_WINDOWS:
        window_end = now + timedelta(hours=hours)
        appointments = Appointment.objects.select_related(
            'patient__user',
            'professional__user',
            'clinic',
        ).filter(
            status=Appointment.Status.SCHEDULED,
            scheduled_at__gt=now,
            scheduled_at__lte=window_end,
        )
        for appointment in appointments:
            sent += notify_appointment_reminder(appointment, reminder_kind=kind)

    return {'sent': sent}
