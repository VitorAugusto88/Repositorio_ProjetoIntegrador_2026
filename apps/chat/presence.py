"""
Helpers de presenca online (usados pelo consumer WebSocket e pela decisao de
push de chat). Sao funcoes sincronas; o consumer async as chama via
database_sync_to_async.
"""
from django.db import transaction
from django.utils import timezone

from .models import Presence


def mark_online(user_id):
    """Registra uma nova conexao WebSocket do usuario."""
    with transaction.atomic():
        presence, _ = Presence.objects.select_for_update().get_or_create(
            user_id=user_id,
        )
        presence.connection_count += 1
        presence.is_online = True
        presence.last_seen = timezone.now()
        presence.save(update_fields=['connection_count', 'is_online', 'last_seen'])


def mark_offline(user_id):
    """Encerra uma conexao WebSocket. So fica offline quando a ultima cai."""
    with transaction.atomic():
        presence = (
            Presence.objects.select_for_update()
            .filter(user_id=user_id)
            .first()
        )
        if presence is None:
            return
        presence.connection_count = max(0, presence.connection_count - 1)
        presence.is_online = presence.connection_count > 0
        presence.last_seen = timezone.now()
        presence.save(update_fields=['connection_count', 'is_online', 'last_seen'])


def is_user_online(user_id):
    """True se o usuario tem ao menos uma conexao WebSocket ativa."""
    return Presence.objects.filter(user_id=user_id, is_online=True).exists()
