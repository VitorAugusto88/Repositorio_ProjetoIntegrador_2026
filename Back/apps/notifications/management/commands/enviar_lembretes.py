"""
Dispara os lembretes de consultas proximas (janelas de 24h e 1h).

Feito para rodar num agendador externo (Render Cron Job), sem depender de um
worker Celery: chama a tarefa diretamente e ela roda inline (ALWAYS_EAGER).

    python manage.py enviar_lembretes
"""
from django.core.management.base import BaseCommand

from apps.notifications.tasks import send_upcoming_appointment_reminders


class Command(BaseCommand):
    help = 'Envia lembretes de consultas proximas (janelas de 24h e 1h).'

    def handle(self, *args, **options):
        result = send_upcoming_appointment_reminders()
        sent = result.get('sent', 0)
        self.stdout.write(
            self.style.SUCCESS(f'Lembretes processados: {sent} notificacao(oes) criada(s).')
        )
