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
    Estrutura base para Firebase Cloud Messaging.
    Integrar aqui o SDK firebase-admin quando houver tokens de dispositivo.
    """
    notification = Notification.objects.get(pk=notification_id)
    firebase_enabled = getattr(settings, 'FIREBASE_PUSH_ENABLED', False)

    if not firebase_enabled:
        notification.status = Notification.Status.PENDING
        notification.save(update_fields=['status'])
        return {'notification_id': str(notification.id), 'skipped': True}

    # TODO: buscar device tokens do usuario e enviar via firebase_admin.messaging.
    notification.status = Notification.Status.SENT
    notification.sent_at = timezone.now()
    notification.save(update_fields=['status', 'sent_at'])
    return {'notification_id': str(notification.id), 'sent': True}


@shared_task
def send_upcoming_appointment_reminders():
    from apps.appointments.models import Appointment
    from .services import notify_appointment_reminder

    now = timezone.now()
    window_end = now + timedelta(hours=24)

    appointments = Appointment.objects.select_related(
        'patient__user',
        'professional__user',
        'clinic',
    ).filter(
        status=Appointment.Status.SCHEDULED,
        scheduled_at__gt=now,
        scheduled_at__lte=window_end,
    )

    sent = 0
    for appointment in appointments:
        sent += notify_appointment_reminder(appointment)

    return {'sent': sent}
