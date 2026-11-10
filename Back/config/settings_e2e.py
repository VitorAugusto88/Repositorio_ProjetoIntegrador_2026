"""
Configuracao do servidor usado pelos testes ponta a ponta (Playwright).

Os testes E2E precisam de uma API rodando de verdade, mas nunca podem gravar
no banco ou no storage da nuvem que o .env de desenvolvimento aponta (R06).
Aqui tudo fica local e descartavel: SQLite em arquivo, uploads em pasta
propria, e-mail em memoria e channel layer em memoria.

Uso (o Playwright faz isso sozinho, ver web/playwright.config.ts):
    python manage.py migrate --settings=config.settings_e2e
    python manage.py popular_e2e --settings=config.settings_e2e
    python manage.py runserver 8010 --settings=config.settings_e2e
"""

from .settings import *  # noqa: F401,F403
from .settings import BASE_DIR, REST_FRAMEWORK

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'e2e.sqlite3',
    }
}

MEDIA_ROOT = BASE_DIR / 'e2e_media'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

CELERY_TASK_ALWAYS_EAGER = True
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}
PUSH_ENABLED = False

# O app web dos testes roda em localhost:8091 (playwright.config.ts).
CORS_ALLOWED_ORIGINS = ['http://localhost:8091', 'http://127.0.0.1:8091']
FRONTEND_URL = 'http://localhost:8091'

# Cada teste faz login; o limite de 5/min derrubaria a bateria.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_RATES': {
        **REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {}),
        'login': '1000/min',
        'password_reset': '1000/min',
        'password_reset_confirm': '1000/min',
    },
}

SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0
