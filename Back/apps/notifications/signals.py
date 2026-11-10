from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.appointments.models import Appointment
from apps.chat.models import ChatMessage

from .services import (
    notify_appointment_cancelled,
    notify_appointment_created,
    notify_appointment_rescheduled,
    notify_new_chat_message,
)


@receiver(pre_save, sender=Appointment)
def store_previous_appointment_state(sender, instance, **kwargs):
    if not instance.pk:
        instance._notification_previous_state = None
        return

    previous = Appointment.objects.filter(pk=instance.pk).values(
        'status',
        'scheduled_at',
        'duration_minutes',
        'professional_id',
    ).first()
    instance._notification_previous_state = previous


@receiver(post_save, sender=Appointment)
def notify_appointment_changes(sender, instance, created, **kwargs):
    if created:
        notify_appointment_created(instance)
        return

    previous = getattr(instance, '_notification_previous_state', None)
    if not previous:
        return

    if (
        instance.status == Appointment.Status.CANCELLED
        and previous['status'] != Appointment.Status.CANCELLED
    ):
        notify_appointment_cancelled(instance)
        return

    was_rescheduled = (
        instance.status == Appointment.Status.RESCHEDULED
        and previous['status'] != Appointment.Status.RESCHEDULED
    )
    schedule_changed = (
        previous['scheduled_at'] != instance.scheduled_at
        or previous['duration_minutes'] != instance.duration_minutes
        or previous['professional_id'] != instance.professional_id
    )

    if was_rescheduled or schedule_changed:
        notify_appointment_rescheduled(instance)


@receiver(post_save, sender=ChatMessage)
def notify_chat_message_created(sender, instance, created, **kwargs):
    if created:
        notify_new_chat_message(instance)
