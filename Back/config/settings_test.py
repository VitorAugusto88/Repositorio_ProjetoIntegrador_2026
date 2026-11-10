"""
Configuracao usada apenas para rodar a suite de testes.

O banco de producao/homologacao e um Postgres gerenciado (Supabase) que nao
permite criar o banco temporario `test_*` exigido pelo runner do Django. Para
que o ciclo de TDD possa ser executado localmente, os testes rodam em SQLite
em memoria — nenhum campo especifico de Postgres e usado pelos modelos.

Uso:
    python manage.py test --settings=config.settings_test
"""

from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Evita depender de Redis/SMTP durante os testes.
CELERY_TASK_ALWAYS_EAGER = True
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
