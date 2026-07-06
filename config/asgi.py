import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from apps.chat.routing import websocket_urlpatterns  # noqa: E402


application = ProtocolTypeRouter({
    'http': django_asgi_app,
    # AllowedHostsOriginValidator foi removido: clientes mobile (React Native)
    # nao enviam Origin header, causando rejeicao silenciosa da conexao WS.
    # A autenticacao e feita por JWT no query-string dentro do consumer.
    'websocket': URLRouter(websocket_urlpatterns),
})
