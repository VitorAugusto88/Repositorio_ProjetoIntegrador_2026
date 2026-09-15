from datetime import time, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.clinics.models import Clinic, Room

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


class AppointmentRoomTests(APITestCase):
    """
    Sala opcional na consulta.

    Regras cobertas: sala opcional, isolamento por clinica, sala inativa,
    paciente sem permissao de escolher sala e ocupacao calculada por
    intersecao de intervalos `[scheduled_at, scheduled_at + duration)`.
    """

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica de Salas')
        cls.other_clinic = Clinic.objects.create(name='Clinica Vizinha')

        professional_user = User.objects.create_user(
            email='room.prof@example.com', password='SenhaTeste123',
            full_name='Profissional da Sala', role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        cls.professional = ProfessionalProfile.objects.create(
            user=professional_user, crp='ROOM-1'
        )

        # Segundo profissional da mesma clinica: a sala precisa continuar
        # bloqueada mesmo quando quem atende e outra pessoa.
        other_professional_user = User.objects.create_user(
            email='room.prof2@example.com', password='SenhaTeste123',
            full_name='Outro Profissional', role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        cls.other_professional = ProfessionalProfile.objects.create(
            user=other_professional_user, crp='ROOM-2'
        )

        patient_user = User.objects.create_user(
            email='room.patient@example.com', password='SenhaTeste123',
            full_name='Paciente da Sala', role=User.Role.PATIENT,
            clinic=cls.clinic,
        )
        cls.patient = PatientProfile.objects.create(
            user=patient_user, assigned_professional=cls.professional
        )
        cls.patient_user = patient_user

        cls.admin = User.objects.create_user(
            email='room.admin@example.com', password='SenhaTeste123',
            full_name='Admin da Sala', role=User.Role.ADMIN, clinic=cls.clinic,
        )

        cls.room = Room.objects.create(clinic=cls.clinic, name='Sala 01')
        cls.inactive_room = Room.objects.create(
            clinic=cls.clinic, name='Sala Desativada', is_active=False
        )
        cls.foreign_room = Room.objects.create(
            clinic=cls.other_clinic, name='Sala de Outra Clinica'
        )

        # A disponibilidade e validada em horario local (America/Sao_Paulo),
        # entao a data base tambem precisa ser montada em horario local.
        cls.scheduled_at = timezone.localtime(
            timezone.now() + timedelta(days=7)
        ).replace(hour=10, minute=0, second=0, microsecond=0)

        for professional in (cls.professional, cls.other_professional):
            Availability.objects.create(
                professional=professional,
                weekday=cls.scheduled_at.weekday(),
                start_time=time(8, 0), end_time=time(18, 0),
            )

    def payload(self, **extra):
        payload = {
            'professional': str(self.professional.id),
            'patient': str(self.patient.id),
            'clinic': str(self.clinic.id),
            'scheduled_at': self.scheduled_at.isoformat(),
            'duration_minutes': 50,
        }
        payload.update(extra)
        return payload

    def ocupar_sala(self, start=None, duration=50, status_consulta='scheduled'):
        """Ocupa a sala com uma consulta de OUTRO profissional."""
        return Appointment.objects.create(
            patient=self.patient, professional=self.other_professional,
            clinic=self.clinic, room=self.room,
            scheduled_at=start or self.scheduled_at,
            duration_minutes=duration,
            status=status_consulta,
        )

    # --- sala opcional -----------------------------------------------------

    def test_admin_pode_agendar_sem_sala(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse('appointment-list'), self.payload())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data['room'])
        self.assertIsNone(response.data['room_detail'])

    def test_admin_pode_agendar_com_sala(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['room_detail']['name'], 'Sala 01')

    def test_profissional_pode_agendar_com_sala(self):
        self.client.force_authenticate(self.professional.user)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(str(response.data['room']), str(self.room.id))

    # --- permissoes e escopo ----------------------------------------------

    def test_paciente_nao_pode_escolher_sala(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_sala_de_outra_clinica_e_rejeitada(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.foreign_room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_sala_inativa_nao_pode_ser_usada_em_novo_agendamento(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.inactive_room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    # --- ocupacao por intersecao de intervalos -----------------------------

    def test_sala_sobreposta_e_rejeitada_mesmo_com_profissional_diferente(self):
        self.ocupar_sala()
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_sobreposicao_parcial_e_rejeitada(self):
        # Existente 10:00-10:50; nova 10:30-11:20 invade os ultimos 20 minutos.
        self.ocupar_sala()
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse('appointment-list'), self.payload(
            room=str(self.room.id),
            scheduled_at=(self.scheduled_at + timedelta(minutes=30)).isoformat(),
        ))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_consulta_contida_no_intervalo_e_rejeitada(self):
        # Existente 10:00-11:40; nova 10:20-10:50 fica inteiramente dentro.
        self.ocupar_sala(duration=100)
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse('appointment-list'), self.payload(
            room=str(self.room.id),
            scheduled_at=(self.scheduled_at + timedelta(minutes=20)).isoformat(),
            duration_minutes=30,
        ))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_agendamento_exatamente_apos_o_fim_e_aceito(self):
        # Existente 10:00-10:50; nova comeca 10:50 — o intervalo e fechado no
        # inicio e aberto no fim, entao nao ha conflito.
        self.ocupar_sala()
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse('appointment-list'), self.payload(
            room=str(self.room.id),
            scheduled_at=(self.scheduled_at + timedelta(minutes=50)).isoformat(),
        ))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_consulta_cancelada_libera_a_sala(self):
        self.ocupar_sala(status_consulta='cancelled')
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse('appointment-list'), self.payload(room=str(self.room.id))
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_remarcacao_recalcula_o_conflito_de_sala(self):
        ocupada = self.ocupar_sala(start=self.scheduled_at + timedelta(minutes=60))
        consulta = Appointment.objects.create(
            patient=self.patient, professional=self.professional,
            clinic=self.clinic, room=self.room,
            scheduled_at=self.scheduled_at, duration_minutes=50,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse('appointment-detail', args=[consulta.id]),
            {'scheduled_at': ocupada.scheduled_at.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('room', response.data)

    def test_remarcacao_para_horario_livre_e_aceita(self):
        consulta = Appointment.objects.create(
            patient=self.patient, professional=self.professional,
            clinic=self.clinic, room=self.room,
            scheduled_at=self.scheduled_at, duration_minutes=50,
        )
        self.client.force_authenticate(self.admin)

        novo_horario = self.scheduled_at + timedelta(minutes=120)
        response = self.client.patch(
            reverse('appointment-detail', args=[consulta.id]),
            {'scheduled_at': novo_horario.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    # --- leitura -----------------------------------------------------------

    def test_detalhe_retorna_sala_e_profissional(self):
        consulta = Appointment.objects.create(
            patient=self.patient, professional=self.professional,
            clinic=self.clinic, room=self.room,
            scheduled_at=self.scheduled_at, duration_minutes=50,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse('appointment-detail', args=[consulta.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['room_detail']['name'], 'Sala 01')
        self.assertEqual(
            response.data['professional_detail']['user']['full_name'],
            'Profissional da Sala',
        )

    def test_consulta_sem_sala_retorna_room_detail_nulo(self):
        consulta = Appointment.objects.create(
            patient=self.patient, professional=self.professional,
            clinic=self.clinic, scheduled_at=self.scheduled_at,
            duration_minutes=50,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse('appointment-detail', args=[consulta.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNone(response.data['room_detail'])
