from types import SimpleNamespace
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db.models import Q
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import ChatMessage
from .realtime import conversation_group_name, serialize_message_for_event
from .serializers import ChatMessageSerializer, users_can_chat
from apps.accounts.models import User


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = await self._authenticate()
        if not self.user:
            await self.close(code=4401)
            return

        self.contact_id = self.scope['url_route']['kwargs']['contact_id']
        self.contact = await self._get_contact(self.contact_id)
        if not self.contact:
            await self.close(code=4404)
            return

        can_chat = await self._users_can_chat(self.user, self.contact)
        if not can_chat:
            await self.close(code=4403)
            return

        self.group_name = conversation_group_name(self.user.id, self.contact.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Presenca persistida: marca o usuario online enquanto esta conexao vive.
        # E a fonte de verdade para o campo 'online' das conversas e para decidir
        # se manda push de chat (so quando o destinatario esta offline).
        await self._mark_online()
        self._presence_marked = True

        await self.send_json({
            'type': 'connection.accepted',
            'payload': {
                'user': str(self.user.id),
                'contact': str(self.contact.id),
            },
        })
        # reply=True: pede que quem ja estava na conversa responda com a propria
        # presenca, para que este usuario que acabou de entrar saiba se o contato
        # esta online (sem isso, quem conecta por ultimo ve o outro como ausente).
        await self._broadcast_presence(is_online=True, reply=True)

    async def disconnect(self, close_code):
        if getattr(self, '_presence_marked', False):
            await self._mark_offline()
            self._presence_marked = False
        if hasattr(self, 'group_name'):
            await self._broadcast_presence(is_online=False)
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )

    async def receive_json(self, content, **kwargs):
        event_type = content.get('type') or content.get('event')
        payload = content.get('payload', {})

        if event_type == 'message.new':
            await self._handle_new_message(payload)
            return

        if event_type == 'message.read':
            await self._handle_message_read(payload)
            return

        if event_type == 'typing':
            await self._broadcast_typing(payload)
            return

        await self.send_json({
            'type': 'error',
            'payload': {'detail': 'Evento nao suportado.'},
        })

    async def _handle_new_message(self, payload):
        result = await self._create_message(payload)
        if result.get('errors'):
            await self.send_json({
                'type': 'error',
                'payload': result,
            })
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat.event',
                'event': 'message.new',
                'payload': result['message'],
            }
        )

    async def _handle_message_read(self, payload):
        message_id = payload.get('message_id') or payload.get('id')
        result = await self._mark_message_read(message_id)
        if result.get('errors'):
            await self.send_json({
                'type': 'error',
                'payload': result,
            })
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat.event',
                'event': 'message.read',
                'payload': result,
            }
        )

    async def _broadcast_typing(self, payload):
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat.event',
                'event': 'typing',
                'payload': {
                    'user': str(self.user.id),
                    'is_typing': bool(payload.get('is_typing', True)),
                },
            }
        )

    async def _broadcast_presence(self, is_online, reply=False):
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat.event',
                'event': 'presence',
                'payload': {
                    'user': str(self.user.id),
                    'online': is_online,
                },
                # reply=True significa "estou entrando, respondam com sua presenca".
                # A resposta (reply=False) nao dispara novas respostas, evitando loop.
                'reply': reply,
            }
        )

    async def chat_event(self, event):
        # Handshake de presenca: se outro usuario acabou de entrar (reply=True),
        # respondemos com a nossa propria presenca para que ele saiba que estamos
        # online. So respondemos a pedidos de terceiros (nao ao proprio eco).
        if (
            event.get('event') == 'presence'
            and event.get('reply')
            and event.get('payload', {}).get('user') != str(self.user.id)
        ):
            await self._broadcast_presence(is_online=True, reply=False)

        await self.send_json({
            'type': event['event'],
            'payload': event['payload'],
        })

    async def _authenticate(self):
        raw_token = self._get_raw_token()
        if not raw_token:
            return None
        return await self._get_user_from_token(raw_token)

    def _get_raw_token(self):
        # 1) Header Authorization — clientes nativos (React Native) conseguem enviar.
        headers = dict(self.scope.get('headers', []))
        authorization = headers.get(b'authorization', b'').decode()
        if authorization.lower().startswith('bearer '):
            return authorization.split(' ', 1)[1].strip()

        # 2) Query string ?token=... — no navegador o WebSocket NAO permite header
        # customizado, entao o token vem na URL. Sem ler daqui, a conexao web falha
        # na autenticacao e cai tudo no REST (presenca/lido so atualizam no reload).
        query_string = self.scope.get('query_string', b'').decode()
        token = parse_qs(query_string).get('token', [None])[0]
        if token:
            return token.strip()

        return None

    @database_sync_to_async
    def _get_user_from_token(self, raw_token):
        try:
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(raw_token)
            user = jwt_auth.get_user(validated_token)
        except Exception:
            return None

        if not user or not user.is_active:
            return None

        return user

    @database_sync_to_async
    def _mark_online(self):
        from .presence import mark_online
        mark_online(self.user.id)

    @database_sync_to_async
    def _mark_offline(self):
        from .presence import mark_offline
        mark_offline(self.user.id)

    @database_sync_to_async
    def _get_contact(self, contact_id):
        return User.objects.filter(id=contact_id, is_active=True).first()

    @database_sync_to_async
    def _users_can_chat(self, user, contact):
        return users_can_chat(user, contact)

    @database_sync_to_async
    def _create_message(self, payload):
        data = {
            'receiver': str(self.contact.id),
            'content_encrypted': payload.get('content_encrypted', ''),
            'message_type': payload.get('message_type', ChatMessage.MessageType.TEXT),
        }
        if payload.get('appointment'):
            data['appointment'] = payload['appointment']

        request = SimpleNamespace(user=self.user)
        serializer = ChatMessageSerializer(
            data=data,
            context={'request': request},
        )
        if not serializer.is_valid():
            return {'errors': serializer.errors}

        message = serializer.save(sender=self.user)
        return {'message': serialize_message_for_event(message)}

    @database_sync_to_async
    def _mark_message_read(self, message_id):
        if not message_id:
            return {'errors': {'message_id': 'Informe a mensagem.'}}

        message = ChatMessage.objects.filter(
            Q(sender=self.contact, receiver=self.user)
            | Q(sender=self.user, receiver=self.contact),
            pk=message_id,
        ).first()

        if not message:
            return {'errors': {'message_id': 'Mensagem nao encontrada.'}}

        if message.receiver_id != self.user.id:
            return {'errors': {'message_id': 'Apenas o destinatario pode marcar como lida.'}}

        if not message.read:
            message.read = True
            message.save(update_fields=['read'])

        return {
            'id': str(message.id),
            'reader': str(self.user.id),
            'read': True,
        }
