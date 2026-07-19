import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()

from django.conf import settings  # noqa: E402

from apps.chat.routing import websocket_urlpatterns  # noqa: E402


def _ws_allowed_origins():
    """
    Origins permitidas para o WebSocket. Reutiliza CORS_ALLOWED_ORIGINS (mesma
    fonte por ambiente): em produção contém o domínio da Vercel; em dev, o
    localhost. Trocamos o AllowedHostsOriginValidator (que compara com
    ALLOWED_HOSTS='.onrender.com') porque o frontend fica em OUTRO domínio
    (Vercel), então a origin seria rejeitada e o chat cairia todo no REST.
    """
    origins = list(getattr(settings, 'CORS_ALLOWED_ORIGINS', []) or [])
    if settings.DEBUG:
        for dev in (
            'http://localhost:8081',
            'http://127.0.0.1:8081',
            'http://localhost:19006',
            'http://localhost:3000',
        ):
            if dev not in origins:
                origins.append(dev)
    # Sem nenhuma origin configurada, libera geral para não quebrar o dev.
    return origins or ['*']


application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(
        URLRouter(websocket_urlpatterns),
        _ws_allowed_origins(),
    ),
})
