"""
R02: chat e lembretes testados com o Redis real ligado.

Em desenvolvimento os lembretes rodam sem Redis (CELERY_TASK_ALWAYS_EAGER) e o
chat usa o channel layer em memoria, entao uma falha do Redis passaria
despercebida. Estes testes so rodam quando REDIS_TEST_URL aponta para um Redis
de verdade (homologacao ou o servico do CI); sem a variavel, sao pulados.

    REDIS_TEST_URL=redis://127.0.0.1:6379/15 \
        python manage.py test apps.tests_redis_real --settings=config.settings_test
"""

import os
import unittest
from datetime import timedelta
from unittest import mock

from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment
from apps.chat.routing import websocket_urlpatterns
from apps.clinics.models import Clinic
from apps.notifications.models import Notification

REDIS_TEST_URL = os.environ.get('REDIS_TEST_URL')


@unittest.skipUnless(REDIS_TEST_URL, 'REDIS_TEST_URL nao definida: sem Redis real.')
@override_settings(
    CHANNEL_LAYERS={
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_TEST_URL]},
        },
    },
    CELERY_TASK_ALWAYS_EAGER=False,
)
class RedisRealTests(TransactionTestCase):
    # TransactionTestCase: o consumer do WebSocket e o worker do Celery usam
    # outras conexoes com o banco e precisam enxergar os dados ja gravados.

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from config.celery import app

        # O Celery le broker e backend primeiro do ambiente (antes do settings).
        # Trocar aqui, antes de qualquer envio, garante que nada sai para o
        # REDIS_URL do .env.
        cls._ambiente = mock.patch.dict(os.environ, {
            'CELERY_BROKER_URL': REDIS_TEST_URL,
            'CELERY_RESULT_BACKEND': REDIS_TEST_URL,
        })
        cls._ambiente.start()
        cls._eager_anterior = app.conf.task_always_eager
        app.conf.update(CELERY_TASK_ALWAYS_EAGER=False)
        cls._descarta_conexoes(app)

    @classmethod
    def tearDownClass(cls):
        from config.celery import app

        cls._descarta_conexoes(app)
        app.conf.update(CELERY_TASK_ALWAYS_EAGER=cls._eager_anterior)
        cls._ambiente.stop()
        super().tearDownClass()

    @staticmethod
    def _descarta_conexoes(app):
        app.close()  # pool do broker
        app._local.__dict__.pop('backend', None)  # backend de resultados

    def setUp(self):
        import redis

        redis.Redis.from_url(REDIS_TEST_URL).flushdb()
        clinic = Clinic.objects.create(name='Clinica Redis')
        professional_user = User.objects.create_user(
            email='psi.redis@example.com', password='SenhaTeste123',
            full_name='Psicologo Redis', role=User.Role.PROFESSIONAL, clinic=clinic,
        )
        self.professional = ProfessionalProfile.objects.create(
            user=professional_user, crp='CRP-RD'
        )
        patient_user = User.objects.create_user(
            email='pac.redis@example.com', password='SenhaTeste123',
            full_name='Paciente Redis', role=User.Role.PATIENT, clinic=clinic,
        )
        self.patient = PatientProfile.objects.create(
            user=patient_user, assigned_professional=self.professional
        )
        self.clinic = clinic

    def test_mensagem_do_chat_chega_em_tempo_real_pelo_redis(self):
        async_to_sync(self._abre_chat_e_recebe_mensagem)()

    async def _abre_chat_e_recebe_mensagem(self):
        professional_user = self.professional.user
        patient_user = self.patient.user
        token = AccessToken.for_user(professional_user)

        communicator = WebsocketCommunicator(
            URLRouter(websocket_urlpatterns),
            f'/ws/chat/{patient_user.id}/?token={token}',
        )
        connected, _ = await communicator.connect(timeout=5)
        self.assertTrue(connected)

        try:
            await self._envia_mensagem_pela_api(patient_user, professional_user)

            # Descarta os eventos de conexao/presenca ate chegar a mensagem.
            for _ in range(10):
                evento = await communicator.receive_json_from(timeout=5)
                if evento['type'] == 'message.new':
                    break
            self.assertEqual(evento['type'], 'message.new')
            self.assertEqual(evento['payload']['sender'], str(patient_user.id))
            self.assertEqual(evento['payload']['content_encrypted'], 'ola pelo redis')
        finally:
            await communicator.disconnect()

    async def _envia_mensagem_pela_api(self, sender, receiver):
        from asgiref.sync import sync_to_async

        def enviar():
            client = APIClient()
            client.force_authenticate(user=sender)
            return client.post(
                reverse('chat-messages'),
                {'receiver': str(receiver.id), 'content_encrypted': 'ola pelo redis'},
                format='json',
            )

        response = await sync_to_async(enviar)()
        self.assertEqual(response.status_code, 201, response.data)

    def test_lembrete_de_24h_passa_pelo_broker_e_pelo_worker(self):
        from celery.contrib.testing.worker import start_worker

        from config.celery import app
        from apps.notifications.tasks import send_upcoming_appointment_reminders

        consulta = Appointment.objects.create(
            patient=self.patient, professional=self.professional, clinic=self.clinic,
            scheduled_at=timezone.now() + timedelta(hours=20),
        )

        with start_worker(app, pool='solo', perform_ping_check=False):
            resultado = send_upcoming_appointment_reminders.delay().get(timeout=20)

        self.assertGreater(resultado['sent'], 0)
        destinatarios = set(
            Notification.objects.filter(
                type=Notification.Type.APPOINTMENT_REMINDER,
                metadata__appointment_id=str(consulta.id),
                metadata__reminder_kind='24h',
            ).values_list('user_id', flat=True)
        )
        self.assertEqual(destinatarios, {self.patient.user_id, self.professional.user_id})
