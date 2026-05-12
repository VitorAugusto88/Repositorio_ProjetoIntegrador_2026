from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def conversation_group_name(user_id, other_user_id):
    participants = sorted([str(user_id), str(other_user_id)])
    safe_ids = [value.replace('-', '') for value in participants]
    return f'chat_{safe_ids[0]}_{safe_ids[1]}'


def serialize_message_for_event(message):
    return {
        'id': str(message.id),
        'sender': str(message.sender_id),
        'receiver': str(message.receiver_id),
        'appointment': str(message.appointment_id) if message.appointment_id else None,
        'content_encrypted': message.content_encrypted,
        'message_type': message.message_type,
        'media_url': message.media_url,
        'read': message.read,
        'sent_at': message.sent_at.isoformat(),
    }


def broadcast_chat_event(group_name, event_type, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'chat.event',
                'event': event_type,
                'payload': payload,
            }
        )
    except Exception:
        return
