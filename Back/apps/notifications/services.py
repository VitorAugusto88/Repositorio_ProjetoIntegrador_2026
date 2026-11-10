import logging

from django.conf import settings
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)


def create_notification(
    *,
    user,
    notification_type,
    title,
    body,
    channel=Notification.Channel.IN_APP,
    metadata=None,
    send_email=False,
    send_push=False,
):
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        channel=channel,
        status=(
            Notification.Status.SENT
            if channel == Notification.Channel.IN_APP
            else Notification.Status.PENDING
        ),
        title=title,
        body=body,
        metadata=metadata or {},
        sent_at=timezone.now() if channel == Notification.Channel.IN_APP else None,
    )

    if send_email or channel == Notification.Channel.EMAIL:
        enqueue_email_notification(notification)

    if channel == Notification.Channel.PUSH:
        enqueue_push_notification(notification)

    return notification


def enqueue_email_notification(notification):
    from .tasks import send_email_notification

    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        # Sem worker Celery, o envio roda dentro da requisicao. Uma falha de
        # e-mail (ex.: SMTP bloqueado, provedor fora do ar) nao pode derrubar o
        # endpoint com 500 — marcamos a notificacao como FAILED e seguimos.
        try:
            send_email_notification(notification.id)
        except Exception:
            logger.exception(
                'Falha ao enviar e-mail da notificacao %s', notification.id
            )
            notification.status = Notification.Status.FAILED
            notification.save(update_fields=['status'])
        return

    try:
        send_email_notification.delay(str(notification.id))
    except Exception:
        notification.status = Notification.Status.FAILED
        notification.save(update_fields=['status'])


def enqueue_push_notification(notification):
    from .tasks import send_firebase_push_notification

    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        # Sem worker Celery, o envio roda dentro da requisicao. Uma falha de push
        # (rede/Expo fora do ar) nao pode derrubar o fluxo que originou a
        # notificacao (ex.: salvar uma mensagem de chat) — marcamos FAILED e segue.
        try:
            send_firebase_push_notification(notification.id)
        except Exception:
            logger.exception(
                'Falha ao enviar push da notificacao %s', notification.id
            )
            notification.status = Notification.Status.FAILED
            notification.save(update_fields=['status'])
        return

    try:
        send_firebase_push_notification.delay(str(notification.id))
    except Exception:
        notification.status = Notification.Status.FAILED
        notification.save(update_fields=['status'])


def notify_appointment_created(appointment):
    title = 'Consulta agendada'
    body = (
        f'Consulta agendada para {appointment.scheduled_at:%d/%m/%Y %H:%M} '
        f'na clinica {appointment.clinic.name}.'
    )
    recipients = _appointment_recipients(appointment)
    return _notify_recipients(
        recipients=recipients,
        notification_type=Notification.Type.APPOINTMENT_CONFIRMED,
        title=title,
        body=body,
        metadata={
            'appointment_id': str(appointment.id),
            'event': 'appointment_created',
        },
    )


def notify_appointment_cancelled(appointment):
    title = 'Consulta cancelada'
    body = (
        f'Consulta de {appointment.scheduled_at:%d/%m/%Y %H:%M} foi cancelada.'
    )
    if appointment.cancel_reason:
        body = f'{body} Motivo: {appointment.cancel_reason}'

    recipients = _appointment_recipients(appointment)
    return _notify_recipients(
        recipients=recipients,
        notification_type=Notification.Type.APPOINTMENT_CANCELLED,
        title=title,
        body=body,
        metadata={
            'appointment_id': str(appointment.id),
            'event': 'appointment_cancelled',
        },
    )


def notify_appointment_rescheduled(appointment):
    title = 'Consulta remarcada'
    body = (
        f'Consulta remarcada para {appointment.scheduled_at:%d/%m/%Y %H:%M}.'
    )
    recipients = _appointment_recipients(appointment)
    return _notify_recipients(
        recipients=recipients,
        notification_type=Notification.Type.APPOINTMENT_RESCHEDULED,
        title=title,
        body=body,
        metadata={
            'appointment_id': str(appointment.id),
            'event': 'appointment_rescheduled',
        },
    )


def notify_new_chat_message(message):
    from apps.chat.presence import is_user_online

    title = 'Nova mensagem'
    body = f'Voce recebeu uma nova mensagem de {message.sender.full_name}.'
    metadata = {
        'message_id': str(message.id),
        'sender_id': str(message.sender_id),
        'event': 'new_message',
    }
    notification = create_notification(
        user=message.receiver,
        notification_type=Notification.Type.NEW_MESSAGE,
        title=title,
        body=body,
        metadata=metadata,
    )
    # Push so quando o destinatario esta com o app/web fechado. Com o app aberto
    # o WebSocket ja entrega em tempo real — mandar push duplicaria o aviso.
    if not is_user_online(message.receiver_id):
        create_notification(
            user=message.receiver,
            notification_type=Notification.Type.NEW_MESSAGE,
            title=title,
            body=body,
            channel=Notification.Channel.PUSH,
            metadata=metadata,
        )
    return notification


def notify_appointment_reminder(appointment, reminder_kind='24h'):
    # Dedup por tipo de janela: o lembrete de "24h" nao impede o de "1h".
    already_sent = Notification.objects.filter(
        user__in=[appointment.patient.user, appointment.professional.user],
        type=Notification.Type.APPOINTMENT_REMINDER,
        metadata__appointment_id=str(appointment.id),
        metadata__reminder_kind=reminder_kind,
    ).exists()

    if already_sent:
        return 0

    # scheduled_at e gravado em UTC; converte para o fuso local (America/Sao_Paulo)
    # para exibir o horario correto na mensagem.
    quando = timezone.localtime(appointment.scheduled_at)
    if reminder_kind == '1h':
        title = 'Sua consulta e daqui a pouco'
        body = (
            f'Voce tem uma consulta as {quando:%H:%M} de hoje '
            f'na clinica {appointment.clinic.name}.'
        )
    else:
        title = 'Lembrete de consulta'
        body = (
            f'Voce tem uma consulta em {quando:%d/%m/%Y %H:%M} '
            f'na clinica {appointment.clinic.name}.'
        )

    recipients = [appointment.patient.user, appointment.professional.user]
    # Consultas nao geram e-mail (decisao de produto): e-mail fica so para
    # senha/login (convite e recuperacao, em utils.py). O lembrete de consulta
    # avisa apenas por in-app e push.
    return _notify_recipients(
        recipients=recipients,
        notification_type=Notification.Type.APPOINTMENT_REMINDER,
        title=title,
        body=body,
        metadata={
            'appointment_id': str(appointment.id),
            'reminder_kind': reminder_kind,
            'event': 'appointment_reminder',
        },
        send_email=False,
        send_push=True,
    )


def _notify_recipients(
    *,
    recipients,
    notification_type,
    title,
    body,
    metadata,
    send_email=False,
    send_push=True,
):
    created = 0
    for user in recipients:
        create_notification(
            user=user,
            notification_type=notification_type,
            title=title,
            body=body,
            metadata=metadata,
        )
        created += 1

        if send_push:
            create_notification(
                user=user,
                notification_type=notification_type,
                title=title,
                body=body,
                channel=Notification.Channel.PUSH,
                metadata=metadata,
            )
            created += 1

        if send_email:
            create_notification(
                user=user,
                notification_type=notification_type,
                title=title,
                body=body,
                channel=Notification.Channel.EMAIL,
                metadata=metadata,
            )
            created += 1

    return created


def _appointment_recipients(appointment):
    from apps.accounts.models import User

    admin_users = User.objects.filter(
        clinic_id=appointment.clinic_id,
        role=User.Role.ADMIN,
        is_active=True,
    )
    recipients = [appointment.patient.user, appointment.professional.user]
    recipients.extend(admin_users)

    unique = {}
    for user in recipients:
        unique[user.id] = user
    return list(unique.values())
