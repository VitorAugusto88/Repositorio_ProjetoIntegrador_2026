"""
RN03 — Ciclo de vida da consulta depois de agendada.

Agendada → Realizada / Falta / Remarcada / Cancelada, com as travas de quem
pode fazer cada transição. Inclui as notas de sessão, que são sigilosas:
só o psicólogo da consulta lê e escreve.
"""

from datetime import time, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.audit.models import AuditLog
from apps.clinics.models import Clinic

from .models import Appointment, Availability, SessionNote

SENHA = 'SenhaTeste123'


class CicloDeVidaBase(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.clinica = Clinic.objects.create(name='Clinica Ciclo')
        cls.admin = cls._user('admin.ciclo@example.com', User.Role.ADMIN)
        cls.psicologo = cls._psicologo('psi.ciclo@example.com', 'CRP-C1')
        cls.outro_psicologo = cls._psicologo('outro.ciclo@example.com', 'CRP-C2')
        cls.paciente = cls._paciente('pac.ciclo@example.com')
        cls.outro_paciente = cls._paciente('outro.pac@example.com')

        # Disponível todos os dias, o dia inteiro: a agenda não interfere aqui.
        for psicologo in (cls.psicologo, cls.outro_psicologo):
            for dia in range(7):
                Availability.objects.create(
                    professional=psicologo, weekday=dia,
                    start_time=time(0, 0), end_time=time(23, 59),
                )

    @classmethod
    def _user(cls, email, role):
        return User.objects.create_user(
            email=email, password=SENHA, full_name=email.split('@')[0],
            role=role, clinic=cls.clinica,
        )

    @classmethod
    def _psicologo(cls, email, crp):
        return ProfessionalProfile.objects.create(
            user=cls._user(email, User.Role.PROFESSIONAL), crp=crp,
        )

    @classmethod
    def _paciente(cls, email):
        return PatientProfile.objects.create(
            user=cls._user(email, User.Role.PATIENT),
            assigned_professional=cls.psicologo,
        )

    def _consulta(self, dias=0, horas=0, paciente=None, **extra):
        quando = (timezone.localtime() + timedelta(days=dias, hours=horas)).replace(
            minute=0, second=0, microsecond=0,
        )
        return Appointment.objects.create(
            patient=paciente or self.paciente, professional=self.psicologo,
            clinic=self.clinica, scheduled_at=quando, **extra,
        )

    def _patch(self, usuario, consulta, corpo):
        self.client.force_authenticate(user=usuario)
        return self.client.patch(
            reverse('appointment-detail', args=[consulta.id]), corpo, format='json',
        )


class TransicaoDeStatusTests(CicloDeVidaBase):

    def test_psicologo_marca_consulta_passada_como_realizada(self):
        consulta = self._consulta(dias=-1)

        response = self._patch(self.psicologo.user, consulta, {'status': 'completed'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.COMPLETED)
        self.assertIsNotNone(consulta.completed_at)

    def test_data_de_realizacao_no_futuro_e_recusada(self):
        consulta = self._consulta(dias=-1)
        amanha = (timezone.now() + timedelta(days=1)).isoformat()

        response = self._patch(
            self.psicologo.user, consulta, {'status': 'completed', 'completed_at': amanha},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('completed_at', response.data)

    def test_falta_em_consulta_futura_e_recusada(self):
        consulta = self._consulta(dias=3)

        response = self._patch(self.psicologo.user, consulta, {'status': 'no_show'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.SCHEDULED)

    def test_falta_em_consulta_passada_e_aceita(self):
        consulta = self._consulta(dias=-2)

        response = self._patch(self.psicologo.user, consulta, {'status': 'no_show'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_paciente_nao_marca_a_propria_consulta_como_realizada(self):
        consulta = self._consulta(dias=-1)

        response = self._patch(self.paciente.user, consulta, {'status': 'completed'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.SCHEDULED)

    def test_desfazer_realizada_volta_para_agendada_e_limpa_a_data(self):
        consulta = self._consulta(
            dias=-1, status=Appointment.Status.COMPLETED, completed_at=timezone.now(),
        )

        response = self._patch(self.psicologo.user, consulta, {'status': 'scheduled'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        consulta.refresh_from_db()
        self.assertIsNone(consulta.completed_at)

    def test_cancelada_e_estado_final(self):
        consulta = self._consulta(dias=3, status=Appointment.Status.CANCELLED)

        response = self._patch(self.admin, consulta, {'status': 'scheduled'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_consulta_realizada_nao_muda_de_horario(self):
        consulta = self._consulta(
            dias=-1, status=Appointment.Status.COMPLETED, completed_at=timezone.now(),
        )
        nova_data = (consulta.scheduled_at + timedelta(days=1)).isoformat()

        response = self._patch(self.admin, consulta, {'scheduled_at': nova_data})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remarcar_exige_nova_data(self):
        consulta = self._consulta(dias=3)

        sem_data = self._patch(self.admin, consulta, {'status': 'rescheduled'})
        self.assertEqual(sem_data.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('scheduled_at', sem_data.data)

        nova = (consulta.scheduled_at + timedelta(days=1)).isoformat()
        com_data = self._patch(
            self.admin, consulta, {'status': 'rescheduled', 'scheduled_at': nova},
        )
        self.assertEqual(com_data.status_code, status.HTTP_200_OK, com_data.data)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.RESCHEDULED)

    def test_edicao_fica_registrada_na_auditoria(self):
        consulta = self._consulta(dias=-1)

        self._patch(self.psicologo.user, consulta, {'status': 'completed'})

        log = AuditLog.objects.get(action=AuditLog.Action.APPOINTMENT_UPDATED)
        self.assertEqual(log.target_id, str(consulta.id))
        self.assertIn('status', log.metadata['changed_fields'])


class CancelamentoTests(CicloDeVidaBase):

    def _cancelar(self, usuario, consulta, corpo=None):
        self.client.force_authenticate(user=usuario)
        return self.client.post(
            reverse('appointment-cancel', args=[consulta.id]), corpo or {}, format='json',
        )

    def test_paciente_cancela_a_propria_consulta_com_motivo(self):
        consulta = self._consulta(dias=2)

        response = self._cancelar(self.paciente.user, consulta, {'cancel_reason': 'Viagem'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.CANCELLED)
        self.assertEqual(consulta.cancel_reason, 'Viagem')

    def test_motivo_e_opcional(self):
        consulta = self._consulta(dias=2)

        response = self._cancelar(self.admin, consulta)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_paciente_nao_cancela_consulta_de_outro_paciente(self):
        consulta = self._consulta(dias=2, paciente=self.outro_paciente)

        response = self._cancelar(self.paciente.user, consulta)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        consulta.refresh_from_db()
        self.assertEqual(consulta.status, Appointment.Status.SCHEDULED)

    def test_psicologo_nao_cancela_consulta_de_outro_psicologo(self):
        consulta = self._consulta(dias=2)

        response = self._cancelar(self.outro_psicologo.user, consulta)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_consulta_ja_cancelada_nao_e_cancelada_de_novo(self):
        consulta = self._consulta(dias=2, status=Appointment.Status.CANCELLED)

        response = self._cancelar(self.admin, consulta)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_consulta_realizada_nao_pode_ser_cancelada(self):
        consulta = self._consulta(dias=-1, status=Appointment.Status.COMPLETED)

        response = self._cancelar(self.admin, consulta)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelamento_libera_o_horario_para_outro_paciente(self):
        consulta = self._consulta(dias=4)
        self._cancelar(self.admin, consulta)

        response = self.client.post(
            reverse('appointment-list'),
            {
                'patient': str(self.outro_paciente.id),
                'professional': str(self.psicologo.id),
                'clinic': str(self.clinica.id),
                'scheduled_at': consulta.scheduled_at.isoformat(),
                'duration_minutes': 50,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_cancelamento_fica_registrado_na_auditoria(self):
        consulta = self._consulta(dias=2)

        self._cancelar(self.paciente.user, consulta, {'cancel_reason': 'Motivo pessoal'})

        log = AuditLog.objects.get(action=AuditLog.Action.APPOINTMENT_CANCELLED)
        self.assertEqual(log.target_id, str(consulta.id))
        self.assertEqual(log.actor_id, self.paciente.user.id)
        # O texto do motivo não vai para o log, só o fato de ter sido informado.
        self.assertNotIn('Motivo pessoal', str(log.metadata))


class NotasDeSessaoTests(CicloDeVidaBase):

    def _notas(self, usuario, consulta, metodo='get', corpo=None):
        self.client.force_authenticate(user=usuario)
        url = reverse('session-notes', args=[consulta.id])
        return getattr(self.client, metodo)(url, corpo, format='json')

    def test_psicologo_escreve_e_le_a_nota_da_propria_consulta(self):
        consulta = self._consulta(dias=-1)

        escrita = self._notas(
            self.psicologo.user, consulta, 'patch', {'notes': 'Paciente relatou melhora.'},
        )
        self.assertEqual(escrita.status_code, status.HTTP_200_OK, escrita.data)

        leitura = self._notas(self.psicologo.user, consulta)
        self.assertEqual(leitura.data['notes'], 'Paciente relatou melhora.')

    def test_secretaria_nao_le_nota_de_sessao(self):
        consulta = self._consulta(dias=-1)
        SessionNote.objects.create(appointment=consulta, notes='Sigiloso')

        response = self._notas(self.admin, consulta)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn('Sigiloso', str(response.data))

    def test_paciente_nao_le_nota_de_sessao(self):
        consulta = self._consulta(dias=-1)
        SessionNote.objects.create(appointment=consulta, notes='Sigiloso')

        response = self._notas(self.paciente.user, consulta)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_outro_psicologo_nao_le_nota_de_sessao(self):
        consulta = self._consulta(dias=-1)
        SessionNote.objects.create(appointment=consulta, notes='Sigiloso')

        response = self._notas(self.outro_psicologo.user, consulta)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detalhe_da_consulta_nao_expoe_a_nota_ao_paciente(self):
        consulta = self._consulta(dias=-1)
        SessionNote.objects.create(appointment=consulta, notes='Sigiloso')
        self.client.force_authenticate(user=self.paciente.user)

        response = self.client.get(reverse('appointment-detail', args=[consulta.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('Sigiloso', str(response.data))


class ResumoDoPsicologoTests(CicloDeVidaBase):

    def test_resumo_conta_consultas_de_hoje_e_pacientes(self):
        hoje = timezone.localtime().replace(hour=23, minute=0, second=0, microsecond=0)
        Appointment.objects.create(
            patient=self.paciente, professional=self.psicologo,
            clinic=self.clinica, scheduled_at=hoje,
        )
        self._consulta(dias=5, paciente=self.outro_paciente)
        self._consulta(dias=6, status=Appointment.Status.CANCELLED)
        self.client.force_authenticate(user=self.psicologo.user)

        response = self.client.get(reverse('appointment-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['consultas_hoje'], 1)
        self.assertEqual(response.data['total_pacientes'], 2)

    def test_secretaria_nao_acessa_o_resumo_do_psicologo(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse('appointment-summary'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
