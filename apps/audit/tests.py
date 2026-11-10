"""
Auditoria (LGPD) — o que fica registrado e o que nunca pode ficar.

O log precisa dizer quem fez o quê, em qual clínica e de onde, sem guardar
senha, token ou conteúdo clínico (anamnese, notas de sessão).
"""

from django.test import RequestFactory, TestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.clinics.models import Clinic

from .models import AuditLog
from .services import get_client_ip, log_audit_event


class RegistroDeAuditoriaTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.clinica = Clinic.objects.create(name='Clinica Auditoria')
        cls.admin = User.objects.create_user(
            email='admin.audit@example.com', password='SenhaTeste123',
            full_name='Admin Audit', role=User.Role.ADMIN, clinic=cls.clinica,
        )
        psi = ProfessionalProfile.objects.create(
            user=User.objects.create_user(
                email='psi.audit@example.com', password='SenhaTeste123', full_name='Psi',
                role=User.Role.PROFESSIONAL, clinic=cls.clinica,
            ),
            crp='CRP-AD',
        )
        cls.paciente = PatientProfile.objects.create(
            user=User.objects.create_user(
                email='pac.audit@example.com', password='SenhaTeste123', full_name='Pac',
                role=User.Role.PATIENT, clinic=cls.clinica,
            ),
            assigned_professional=psi,
        )

    def _request(self, **meta):
        request = RequestFactory().post('/api/qualquer/', **meta)
        request.user = self.admin
        return request

    def test_registra_autor_papel_clinica_e_rota(self):
        log = log_audit_event(
            action=AuditLog.Action.PATIENT_UPDATED, target=self.paciente,
            request=self._request(),
        )

        self.assertEqual(log.actor, self.admin)
        self.assertEqual(log.actor_role, 'admin')
        self.assertEqual(log.clinic_id, self.clinica.id)
        self.assertEqual(log.target_model, 'PatientProfile')
        self.assertEqual(log.target_id, str(self.paciente.id))
        self.assertEqual(log.request_method, 'POST')
        self.assertEqual(log.request_path, '/api/qualquer/')

    def test_dados_sensiveis_sao_mascarados(self):
        log = log_audit_event(
            action=AuditLog.Action.PATIENT_ANAMNESIS_UPDATED, target=self.paciente,
            request=self._request(),
            metadata={
                'password': 'Senha123', 'refresh': 'eyJ...', 'anamnesis': 'histórico',
                'notes': 'sigiloso', 'changed_fields': ['anamnesis'],
            },
        )

        for chave in ('password', 'refresh', 'anamnesis', 'notes'):
            self.assertEqual(log.metadata[chave], '[redacted]')
        self.assertEqual(log.metadata['changed_fields'], ['anamnesis'])

    def test_mascaramento_ignora_maiusculas_na_chave(self):
        log = log_audit_event(
            action=AuditLog.Action.USER_LOGIN, target_model='User', target_id='1',
            request=self._request(), metadata={'Password': 'x', 'TOKEN': 'y'},
        )

        self.assertEqual(log.metadata, {'Password': '[redacted]', 'TOKEN': '[redacted]'})

    def test_ip_real_vem_do_proxy(self):
        request = self._request(
            HTTP_X_FORWARDED_FOR='200.10.20.30, 10.0.0.1', REMOTE_ADDR='10.0.0.1',
        )
        self.assertEqual(get_client_ip(request), '200.10.20.30')

    def test_ip_invalido_nao_quebra_o_registro(self):
        request = self._request(HTTP_X_FORWARDED_FOR='nao-e-ip')

        log = log_audit_event(
            action=AuditLog.Action.USER_LOGIN, target_model='User', target_id='1',
            request=request,
        )

        self.assertIsNone(log.ip_address)

    def test_evento_sem_requisicao_e_registrado_como_sistema(self):
        # Ex.: tarefa agendada (Celery) que não vem de uma requisição HTTP.
        log = log_audit_event(
            action=AuditLog.Action.APPOINTMENT_UPDATED, target=self.paciente,
        )

        self.assertIsNone(log.actor)
        self.assertEqual(str(log), 'appointment.updated por sistema')
