from datetime import time, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.clinics.models import Clinic

from .models import Appointment, Availability
from .serializers import AppointmentSerializer


class AppointmentOverdueTests(TestCase):
    """
    "Dia Ultrapassado": estado derivado da consulta em aberto cujo DIA ja
    passou. Nunca e gravado e nao existe acao de usuario que o force.
    """

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Teste')

        patient_user = User.objects.create_user(
            email='paciente@example.com',
            password='SenhaTeste123',
            full_name='Paciente Teste',
            role=User.Role.PATIENT,
            clinic=cls.clinic,
        )
        professional_user = User.objects.create_user(
            email='psicologo@example.com',
            password='SenhaTeste123',
            full_name='Psicologo Teste',
            role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        # O profissional vem primeiro: PatientProfile exige o psicologo
        # responsavel, entao nao ha como criar o paciente antes dele.
        cls.professional = ProfessionalProfile.objects.create(
            user=professional_user,
            crp='12345',
        )
        cls.patient = PatientProfile.objects.create(
            user=patient_user,
            assigned_professional=cls.professional,
        )

    def _appointment(self, scheduled_at, status=Appointment.Status.SCHEDULED):
        return Appointment.objects.create(
            patient=self.patient,
            professional=self.professional,
            clinic=self.clinic,
            scheduled_at=scheduled_at,
            status=status,
        )

    def test_consulta_futura_nao_e_ultrapassada(self):
        appointment = self._appointment(timezone.now() + timedelta(days=3))
        self.assertFalse(appointment.is_overdue)

    def test_consulta_de_hoje_nao_e_ultrapassada_nem_apos_o_horario(self):
        # Mesmo com o horario ja vencido, o dia ainda e hoje: nao ultrapassa.
        inicio_do_dia = timezone.localtime().replace(
            hour=0, minute=30, second=0, microsecond=0
        )
        appointment = self._appointment(inicio_do_dia)
        self.assertFalse(appointment.is_overdue)

    def test_consulta_de_ontem_em_aberto_e_ultrapassada(self):
        appointment = self._appointment(timezone.now() - timedelta(days=1))
        self.assertTrue(appointment.is_overdue)

    def test_remarcada_de_ontem_tambem_e_ultrapassada(self):
        appointment = self._appointment(
            timezone.now() - timedelta(days=1),
            status=Appointment.Status.RESCHEDULED,
        )
        self.assertTrue(appointment.is_overdue)

    def test_consulta_resolvida_nunca_e_ultrapassada(self):
        for status in (
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        ):
            with self.subTest(status=status):
                appointment = self._appointment(
                    timezone.now() - timedelta(days=5),
                    status=status,
                )
                self.assertFalse(appointment.is_overdue)

    def test_serializer_exibe_dia_ultrapassado_sem_mudar_o_status(self):
        appointment = self._appointment(timezone.now() - timedelta(days=2))
        data = AppointmentSerializer(appointment).data

        self.assertEqual(data['status_display'], 'Dia Ultrapassado')
        self.assertTrue(data['is_overdue'])
        # O status gravado continua intacto — o rotulo e so de exibicao.
        self.assertEqual(data['status'], Appointment.Status.SCHEDULED)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)

    def test_serializer_mantem_rotulo_normal_quando_nao_ultrapassada(self):
        appointment = self._appointment(timezone.now() + timedelta(days=1))
        data = AppointmentSerializer(appointment).data

        self.assertEqual(data['status_display'], 'Agendada')
        self.assertFalse(data['is_overdue'])


class AssignedProfessionalTests(APITestCase):
    """
    O paciente so agenda com o psicologo responsavel pelo seu perfil.
    Staff (admin e profissional) escapa da trava para cobrir substituicoes.
    """

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Vinculo')

        cls.titular = cls._professional('titular@example.com', 'CRP-A')
        cls.substituto = cls._professional('substituto@example.com', 'CRP-B')

        cls.patient_user = User.objects.create_user(
            email='vinculado@example.com',
            password='SenhaTeste123',
            full_name='Paciente Vinculado',
            role=User.Role.PATIENT,
            clinic=cls.clinic,
        )
        cls.patient = PatientProfile.objects.create(
            user=cls.patient_user,
            assigned_professional=cls.titular,
        )

        cls.admin_user = User.objects.create_user(
            email='secretaria@example.com',
            password='SenhaTeste123',
            full_name='Secretaria',
            role=User.Role.ADMIN,
            clinic=cls.clinic,
        )

        # Consulta sempre daqui a uma semana as 10h, com os dois profissionais
        # disponiveis naquele dia da semana — assim a validacao de
        # disponibilidade nao interfere no que estamos testando aqui.
        cls.scheduled_at = (timezone.localtime() + timedelta(days=7)).replace(
            hour=10, minute=0, second=0, microsecond=0
        )
        for professional in (cls.titular, cls.substituto):
            Availability.objects.create(
                professional=professional,
                weekday=cls.scheduled_at.weekday(),
                start_time=time(8, 0),
                end_time=time(18, 0),
            )

    @classmethod
    def _professional(cls, email, crp):
        user = User.objects.create_user(
            email=email,
            password='SenhaTeste123',
            full_name=f'Psicologo {crp}',
            role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        return ProfessionalProfile.objects.create(user=user, crp=crp)

    def _payload(self, professional=None, **extra):
        payload = {
            'scheduled_at': self.scheduled_at.isoformat(),
            'duration_minutes': 50,
            'clinic': str(self.clinic.id),
        }
        if professional is not None:
            payload['professional'] = str(professional.id)
        payload.update(extra)
        return payload

    def test_paciente_agenda_sem_informar_profissional(self):
        """Omitindo o campo, a consulta cai no psicologo vinculado."""
        self.client.force_authenticate(user=self.patient_user)
        response = self.client.post(reverse('appointment-list'), self._payload())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        appointment = Appointment.objects.get(id=response.data['id'])
        self.assertEqual(appointment.professional_id, self.titular.id)

    def test_paciente_nao_agenda_com_outro_psicologo(self):
        """A trava real: um POST direto na API tentando outro profissional."""
        self.client.force_authenticate(user=self.patient_user)
        response = self.client.post(
            reverse('appointment-list'),
            self._payload(professional=self.substituto),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('professional', response.data)
        self.assertFalse(
            Appointment.objects.filter(professional=self.substituto).exists()
        )

    def test_paciente_pode_agendar_informando_o_proprio_psicologo(self):
        self.client.force_authenticate(user=self.patient_user)
        response = self.client.post(
            reverse('appointment-list'),
            self._payload(professional=self.titular),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_admin_agenda_com_substituto(self):
        """Titular de ferias: a secretaria precisa marcar com outro."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            reverse('appointment-list'),
            self._payload(professional=self.substituto, patient=str(self.patient.id)),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        appointment = Appointment.objects.get(id=response.data['id'])
        self.assertEqual(appointment.professional_id, self.substituto.id)

    def test_paciente_nao_troca_o_psicologo_de_uma_consulta_existente(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            professional=self.titular,
            clinic=self.clinic,
            scheduled_at=self.scheduled_at,
        )
        self.client.force_authenticate(user=self.patient_user)
        response = self.client.patch(
            reverse('appointment-detail', args=[appointment.id]),
            {'professional': str(self.substituto.id)},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        appointment.refresh_from_db()
        self.assertEqual(appointment.professional_id, self.titular.id)

    def test_admin_precisa_informar_o_profissional(self):
        """
        O campo deixou de ser obrigatorio no DRF para atender paciente e
        psicologo; para o admin a cobranca passou a ser feita no validate().
        """
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            reverse('appointment-list'),
            self._payload(patient=str(self.patient.id)),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('professional', response.data)
