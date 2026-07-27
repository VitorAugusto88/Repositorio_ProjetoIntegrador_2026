from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.clinics.models import Clinic

from .models import Appointment
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
        cls.patient = PatientProfile.objects.create(user=patient_user)
        cls.professional = ProfessionalProfile.objects.create(
            user=professional_user,
            crp='12345',
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
