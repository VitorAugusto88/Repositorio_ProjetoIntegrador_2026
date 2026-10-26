"""
R01 / RN01: cada clinica so enxerga os proprios dados.

Varredura por endpoint: a mesma requisicao e repetida por usuarios da Clinica A
(admin, psicologo e paciente) sobre registros da Clinica B, e todas precisam
ser recusadas. Ao criar uma rota nova que recebe id de registro de outra
clinica, acrescente-a em ROTAS_DE_OBJETO.
"""

from datetime import time, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment, Availability
from apps.chat.models import ChatMessage
from apps.clinics.models import Clinic, Room
from apps.records.models import Document

# O .env de desenvolvimento pode apontar o storage para a nuvem
# (USE_S3_STORAGE=True); os uploads destes testes ficam em memoria.
STORAGE_EM_MEMORIA = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

PDF_VALIDO = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'


@override_settings(STORAGES=STORAGE_EM_MEMORIA)
class IsolamentoEntreClinicasTests(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.clinica_a = Clinic.objects.create(name='Clinica A')
        cls.clinica_b = Clinic.objects.create(name='Clinica B')

        cls.admin_a = cls._user('admin.a@example.com', User.Role.ADMIN, cls.clinica_a)
        cls.admin_b = cls._user('admin.b@example.com', User.Role.ADMIN, cls.clinica_b)
        cls.psicologo_a = cls._psicologo('psi.a@example.com', 'CRP-A', cls.clinica_a)
        cls.psicologo_b = cls._psicologo('psi.b@example.com', 'CRP-B', cls.clinica_b)
        cls.paciente_a = cls._paciente('pac.a@example.com', cls.clinica_a, cls.psicologo_a)
        cls.paciente_b = cls._paciente('pac.b@example.com', cls.clinica_b, cls.psicologo_b)

        quando = (timezone.localtime() + timedelta(days=7)).replace(
            hour=10, minute=0, second=0, microsecond=0
        )
        cls.quando = quando
        cls.disponibilidade_b = Availability.objects.create(
            professional=cls.psicologo_b, weekday=quando.weekday(),
            start_time=time(8, 0), end_time=time(18, 0),
        )
        cls.consulta_b = Appointment.objects.create(
            patient=cls.paciente_b, professional=cls.psicologo_b,
            clinic=cls.clinica_b, scheduled_at=quando,
        )
        cls.sala_b = Room.objects.create(clinic=cls.clinica_b, name='Sala B')
        cls.documento_b = Document.objects.create(
            patient=cls.paciente_b, clinic=cls.clinica_b,
            title='Laudo B', file='documents/laudo-b.pdf',
        )
        # Documento sem paciente: o caso que o R01 aponta como mais provavel.
        cls.documento_avulso_b = Document.objects.create(
            patient=None, clinic=cls.clinica_b,
            title='Avulso B', file='documents/avulso-b.pdf',
        )

    @classmethod
    def _user(cls, email, role, clinic):
        return User.objects.create_user(
            email=email, password='SenhaTeste123', full_name=email.split('@')[0],
            role=role, clinic=clinic,
        )

    @classmethod
    def _psicologo(cls, email, crp, clinic):
        user = cls._user(email, User.Role.PROFESSIONAL, clinic)
        return ProfessionalProfile.objects.create(user=user, crp=crp)

    @classmethod
    def _paciente(cls, email, clinic, psicologo):
        user = cls._user(email, User.Role.PATIENT, clinic)
        return PatientProfile.objects.create(user=user, assigned_professional=psicologo)

    def _rotas_de_objeto(self):
        consulta = self.consulta_b.id
        disponibilidade = self.disponibilidade_b.id
        paciente_user = self.paciente_b.user_id
        clinica = self.clinica_b.id
        return [
            ('get', reverse('appointment-detail', args=[consulta]), None),
            ('patch', reverse('appointment-detail', args=[consulta]), {'duration_minutes': 30}),
            ('post', reverse('appointment-cancel', args=[consulta]), {}),
            ('get', reverse('session-notes', args=[consulta]), None),
            ('get', reverse('availability-detail', args=[disponibilidade]), None),
            ('patch', reverse('availability-detail', args=[disponibilidade]), {'blocked': True}),
            ('delete', reverse('availability-detail', args=[disponibilidade]), None),
            ('get', reverse('document-detail', args=[self.documento_b.id]), None),
            ('get', reverse('document-download', args=[self.documento_b.id]), None),
            ('delete', reverse('document-detail', args=[self.documento_b.id]), None),
            ('get', reverse('document-detail', args=[self.documento_avulso_b.id]), None),
            ('get', reverse('document-download', args=[self.documento_avulso_b.id]), None),
            ('delete', reverse('document-detail', args=[self.documento_avulso_b.id]), None),
            ('get', reverse('patient_profile', args=[paciente_user]), None),
            ('patch', reverse('patient_profile', args=[paciente_user]), {'anamnesis': 'x'}),
            ('get', reverse('professional-detail', args=[self.psicologo_b.id]), None),
            ('patch', reverse('professional-detail', args=[self.psicologo_b.id]), {'bio': 'x'}),
            ('get', reverse('clinic-patient-list', args=[clinica]), None),
            ('get', reverse('admin-user-detail', args=[paciente_user]), None),
            ('patch', reverse('admin-user-detail', args=[paciente_user]), {'full_name': 'x'}),
            ('patch', reverse('admin-user-status', args=[paciente_user]), {'is_active': False}),
            ('get', reverse('clinic-detail', args=[clinica]), None),
            ('patch', reverse('clinic-detail', args=[clinica]), {'name': 'x'}),
            ('get', reverse('clinic-professionals', args=[clinica]), None),
            ('get', reverse('clinic-stats', args=[clinica]), None),
            ('get', reverse('clinic-room-list', args=[clinica]), None),
            ('get', reverse('clinic-room-detail', args=[clinica, self.sala_b.id]), None),
            ('get', reverse('report-patient', args=[self.paciente_b.id]), None),
            ('get', reverse('report-admin-appointments') + f'?clinic_id={clinica}', None),
            ('get', reverse('report-professional-summary') + f'?professional_id={self.psicologo_b.id}', None),
            ('get', reverse('professionals') + f'?clinic_id={clinica}', None),
            ('get', reverse('chat-messages') + f'?with={paciente_user}', None),
        ]

    def _assert_recusa_todas_as_rotas(self, usuario):
        self.client.force_authenticate(user=usuario)
        aceitas = []
        for metodo, url, corpo in self._rotas_de_objeto():
            response = getattr(self.client, metodo)(url, corpo, format='json')
            if response.status_code < 400:
                aceitas.append(f'{metodo.upper()} {url} -> {response.status_code}')

        self.assertEqual(aceitas, [], 'Rotas que aceitaram dado de outra clinica')
        self._assert_clinica_b_intacta()

    def _assert_clinica_b_intacta(self):
        self.consulta_b.refresh_from_db()
        self.assertEqual(self.consulta_b.status, Appointment.Status.SCHEDULED)
        self.assertEqual(self.consulta_b.duration_minutes, 50)
        self.assertTrue(Availability.objects.filter(pk=self.disponibilidade_b.pk, blocked=False).exists())
        self.assertTrue(Document.objects.filter(pk=self.documento_b.pk).exists())
        self.assertTrue(Document.objects.filter(pk=self.documento_avulso_b.pk).exists())
        self.clinica_b.refresh_from_db()
        self.assertEqual(self.clinica_b.name, 'Clinica B')
        self.paciente_b.user.refresh_from_db()
        self.assertTrue(self.paciente_b.user.is_active)

    def test_admin_da_clinica_a_nao_acessa_a_clinica_b(self):
        self._assert_recusa_todas_as_rotas(self.admin_a)

    def test_psicologo_da_clinica_a_nao_acessa_a_clinica_b(self):
        self._assert_recusa_todas_as_rotas(self.psicologo_a.user)

    def test_paciente_da_clinica_a_nao_acessa_a_clinica_b(self):
        self._assert_recusa_todas_as_rotas(self.paciente_a.user)

    def test_listas_nao_trazem_registros_da_clinica_b(self):
        self.client.force_authenticate(user=self.admin_a)
        listas = {
            reverse('appointment-list'): self.consulta_b.id,
            reverse('appointment-list') + f'?patient={self.paciente_b.id}': self.consulta_b.id,
            reverse('availability-list') + f'?professional={self.psicologo_b.id}': self.disponibilidade_b.id,
            reverse('document-list'): self.documento_b.id,
            reverse('document-list') + '?scope=avulsos': self.documento_avulso_b.id,
            reverse('admin-user-list'): self.paciente_b.user_id,
            reverse('professionals'): self.psicologo_b.id,
            reverse('clinic-list'): self.clinica_b.id,
            reverse('chat-contacts'): self.paciente_b.user_id,
        }
        for url, id_da_clinica_b in listas.items():
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertNotIn(str(id_da_clinica_b), str(response.data))

    def test_criar_registro_apontando_para_a_clinica_b_e_recusado(self):
        self.client.force_authenticate(user=self.admin_a)
        tentativas = [
            (reverse('appointment-list'), {
                'clinic': str(self.clinica_a.id),
                'patient': str(self.paciente_b.id),
                'professional': str(self.psicologo_b.id),
                'scheduled_at': (self.quando + timedelta(hours=2)).isoformat(),
            }, 'json'),
            (reverse('document-list'), {
                'title': 'x',
                'patient': str(self.paciente_b.id),
                'file': SimpleUploadedFile('x.pdf', PDF_VALIDO, 'application/pdf'),
            }, 'multipart'),
            (reverse('chat-messages'), {
                'receiver': str(self.paciente_b.user_id),
                'content_encrypted': 'oi',
            }, 'json'),
            (reverse('admin-patient-create'), {
                'email': 'novo@example.com',
                'full_name': 'Novo',
                'send_invite': False,
                'assigned_professional': str(self.psicologo_b.id),
            }, 'json'),
        ]
        for url, corpo, formato in tentativas:
            with self.subTest(url=url):
                response = self.client.post(url, corpo, format=formato)
                self.assertIn(response.status_code, (400, 403, 404), response.data)

        self.assertEqual(Appointment.objects.filter(patient=self.paciente_b).count(), 1)
        self.assertEqual(Document.objects.filter(patient=self.paciente_b).count(), 1)
        self.assertFalse(ChatMessage.objects.exists())
        self.assertFalse(User.objects.filter(email='novo@example.com').exists())

    def test_documento_sem_paciente_fica_na_clinica_de_quem_enviou(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(
            reverse('document-list'),
            {'title': 'Avulso A', 'file': SimpleUploadedFile('a.pdf', PDF_VALIDO, 'application/pdf')},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        documento = Document.objects.get(pk=response.data['id'])
        self.assertIsNone(documento.patient_id)
        self.assertEqual(documento.clinic_id, self.clinica_a.id)

        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(reverse('document-detail', args=[documento.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
