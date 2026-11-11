"""
Testes de lembretes e push (Expo).

Cobrem: registro/baixa de device token, envio de push destravado (mockando o
Expo), tratamento de token invalido, dedup de lembrete por reminder_kind e a
supressao de push de chat quando o destinatario esta online.
"""
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment
from apps.chat.models import ChatMessage, Presence
from apps.clinics.models import Clinic

from .models import DeviceToken, Notification
from .services import notify_appointment_reminder
from .tasks import send_firebase_push_notification


def _clinic():
    return Clinic.objects.create(name='Clinica Teste')


def _user(clinic, role, email):
    return User.objects.create_user(email=email, password='x', full_name=email, role=role, clinic=clinic)


class DeviceTokenEndpointTests(TestCase):
    def setUp(self):
        self.clinic = _clinic()
        self.user = _user(self.clinic, User.Role.PATIENT, 'p@t.com')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_registra_token_faz_upsert(self):
        url = reverse('device-token-register')
        payload = {'token': 'ExponentPushToken[abc]', 'platform': 'android'}

        r1 = self.client.post(url, payload, format='json')
        self.assertEqual(r1.status_code, 200)

        # Mesmo token nao duplica
        r2 = self.client.post(url, payload, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(DeviceToken.objects.filter(token='ExponentPushToken[abc]').count(), 1)

    def test_token_reatribuido_ao_usuario_atual(self):
        DeviceToken.objects.create(
            user=_user(self.clinic, User.Role.PATIENT, 'outro@t.com'),
            token='ExponentPushToken[abc]',
            platform='android',
        )
        self.client.post(
            reverse('device-token-register'),
            {'token': 'ExponentPushToken[abc]', 'platform': 'android'},
            format='json',
        )
        token = DeviceToken.objects.get(token='ExponentPushToken[abc]')
        self.assertEqual(token.user, self.user)

    def test_delete_desativa_token(self):
        DeviceToken.objects.create(user=self.user, token='tok1', platform='ios')
        r = self.client.delete(reverse('device-token-delete', args=['tok1']))
        self.assertEqual(r.status_code, 204)
        self.assertFalse(DeviceToken.objects.get(token='tok1').is_active)


@override_settings(PUSH_ENABLED=True)
class ExpoPushSendTests(TestCase):
    def setUp(self):
        self.clinic = _clinic()
        self.user = _user(self.clinic, User.Role.PATIENT, 'p@t.com')

    def _push_notification(self):
        return Notification.objects.create(
            user=self.user,
            type=Notification.Type.NEW_MESSAGE,
            channel=Notification.Channel.PUSH,
            status=Notification.Status.PENDING,
            title='Oi',
            body='corpo',
        )

    def test_envio_ok_marca_sent(self):
        DeviceToken.objects.create(user=self.user, token='tok-ok', platform='android')
        notif = self._push_notification()
        with mock.patch('apps.notifications.push.send_expo_push', return_value=[{'status': 'ok', 'id': '1'}]):
            send_firebase_push_notification(notif.id)
        notif.refresh_from_db()
        self.assertEqual(notif.status, Notification.Status.SENT)

    def test_sem_token_marca_failed(self):
        notif = self._push_notification()
        with mock.patch('apps.notifications.push.send_expo_push') as m:
            send_firebase_push_notification(notif.id)
            m.assert_not_called()
        notif.refresh_from_db()
        self.assertEqual(notif.status, Notification.Status.FAILED)

    def test_token_invalido_desativado(self):
        DeviceToken.objects.create(user=self.user, token='tok-bad', platform='android')
        notif = self._push_notification()
        ticket = [{'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]
        with mock.patch('apps.notifications.push.send_expo_push', return_value=ticket):
            send_firebase_push_notification(notif.id)
        self.assertFalse(DeviceToken.objects.get(token='tok-bad').is_active)
        notif.refresh_from_db()
        self.assertEqual(notif.status, Notification.Status.FAILED)

    @override_settings(PUSH_ENABLED=False)
    def test_push_desligado_fica_pendente(self):
        DeviceToken.objects.create(user=self.user, token='tok', platform='android')
        notif = self._push_notification()
        send_firebase_push_notification(notif.id)
        notif.refresh_from_db()
        self.assertEqual(notif.status, Notification.Status.PENDING)


class ReminderDedupTests(TestCase):
    def setUp(self):
        self.clinic = _clinic()
        patient_user = _user(self.clinic, User.Role.PATIENT, 'pac@t.com')
        prof_user = _user(self.clinic, User.Role.PROFESSIONAL, 'prof@t.com')
        self.professional = ProfessionalProfile.objects.create(user=prof_user, crp='123')
        self.patient = PatientProfile.objects.create(
            user=patient_user,
            assigned_professional=self.professional,
        )
        self.appt = Appointment.objects.create(
            patient=self.patient,
            professional=self.professional,
            clinic=self.clinic,
            scheduled_at=timezone.now() + timedelta(hours=2),
        )

    def test_dedup_por_kind(self):
        # 24h cria; repetir 24h nao cria de novo; 1h ainda pode criar.
        self.assertGreater(notify_appointment_reminder(self.appt, '24h'), 0)
        self.assertEqual(notify_appointment_reminder(self.appt, '24h'), 0)
        self.assertGreater(notify_appointment_reminder(self.appt, '1h'), 0)

        kinds = set(
            Notification.objects.filter(
                type=Notification.Type.APPOINTMENT_REMINDER,
            ).values_list('metadata__reminder_kind', flat=True)
        )
        self.assertEqual(kinds, {'24h', '1h'})


class ChatPushPresenceTests(TestCase):
    def setUp(self):
        self.clinic = _clinic()
        self.patient = _user(self.clinic, User.Role.PATIENT, 'pac@t.com')
        self.prof = _user(self.clinic, User.Role.PROFESSIONAL, 'prof@t.com')

    def _send_message(self):
        return ChatMessage.objects.create(
            sender=self.prof,
            receiver=self.patient,
            content_encrypted='oi',
        )

    def test_offline_gera_push(self):
        # signal do ChatMessage ja chama notify_new_chat_message
        self._send_message()
        self.assertTrue(
            Notification.objects.filter(
                user=self.patient, channel=Notification.Channel.PUSH,
            ).exists()
        )

    def test_online_nao_gera_push(self):
        Presence.objects.create(user=self.patient, is_online=True, connection_count=1)
        self._send_message()
        self.assertFalse(
            Notification.objects.filter(
                user=self.patient, channel=Notification.Channel.PUSH,
            ).exists()
        )
        # mas a in-app continua existindo
        self.assertTrue(
            Notification.objects.filter(
                user=self.patient, channel=Notification.Channel.IN_APP,
            ).exists()
        )
