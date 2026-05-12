from django.conf import settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.contrib.auth.tokens import default_token_generator

from .models import Notification
from .services import create_notification


def build_password_link(user, frontend_path):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    return (
        f'{frontend_url.rstrip("/")}/{frontend_path.lstrip("/")}'
        f'?uid={uid}&token={token}'
    )


def send_notification_email(user, notification_type, title, body):
    return create_notification(
        user=user,
        notification_type=notification_type,
        channel=Notification.Channel.EMAIL,
        title=title,
        body=body,
    )


def send_invitation_email(user):
    link = build_password_link(
        user,
        getattr(settings, 'FRONTEND_INVITE_PASSWORD_PATH', '/set-password')
    )
    body = (
        f'Ola, {user.full_name}.\n\n'
        'Sua conta no ClinicSystem foi criada. '
        'Acesse o link abaixo para definir sua senha inicial:\n\n'
        f'{link}\n\n'
        'Se voce nao esperava este convite, ignore este email.'
    )
    return send_notification_email(
        user=user,
        notification_type=Notification.Type.GENERAL,
        title='Convite para acessar o ClinicSystem',
        body=body,
    )


def send_password_reset_email(user):
    link = build_password_link(
        user,
        getattr(settings, 'FRONTEND_RESET_PASSWORD_PATH', '/reset-password')
    )
    body = (
        f'Ola, {user.full_name}.\n\n'
        'Recebemos uma solicitacao para redefinir sua senha. '
        'Acesse o link abaixo para criar uma nova senha:\n\n'
        f'{link}\n\n'
        'Se voce nao solicitou a recuperacao, ignore este email.'
    )
    return send_notification_email(
        user=user,
        notification_type=Notification.Type.GENERAL,
        title='Recuperacao de senha do ClinicSystem',
        body=body,
    )
