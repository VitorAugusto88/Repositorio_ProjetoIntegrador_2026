from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment

from .models import Clinic, Room


class RoomCrudTests(APITestCase):
    """CRUD de salas: permissoes por papel e isolamento entre clinicas."""

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Salas')
        cls.other_clinic = Clinic.objects.create(name='Outra Clinica')
        cls.admin = User.objects.create_user(
            email='admin.salas@example.com',
            password='SenhaTeste123',
            full_name='Admin Salas',
            role=User.Role.ADMIN,
            clinic=cls.clinic,
        )
        cls.professional = User.objects.create_user(
            email='prof.salas@example.com',
            password='SenhaTeste123',
            full_name='Profissional Salas',
            role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )

    def rooms_url(self, clinic=None):
        return reverse('clinic-room-list', args=[(clinic or self.clinic).id])

    def room_url(self, room, clinic=None):
        return reverse('clinic-room-detail', args=[(clinic or self.clinic).id, room.id])

    def test_admin_cria_sala_na_propria_clinica(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.rooms_url(), {
            'name': 'Sala 01',
            'description': 'Sala de atendimento individual',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['name'], 'Sala 01')
        self.assertTrue(Room.objects.filter(clinic=self.clinic, name='Sala 01').exists())

    def test_nome_e_obrigatorio(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.rooms_url(), {'description': 'Sem nome'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_profissional_lista_salas_mas_nao_cria(self):
        Room.objects.create(clinic=self.clinic, name='Sala 01')
        self.client.force_authenticate(self.professional)

        list_response = self.client.get(self.rooms_url())
        create_response = self.client.post(self.rooms_url(), {'name': 'Sala 02'})

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data['results']), 1)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_profissional_nao_edita_nem_exclui_sala(self):
        room = Room.objects.create(clinic=self.clinic, name='Sala 01')
        self.client.force_authenticate(self.professional)

        patch_response = self.client.patch(self.room_url(room), {'name': 'Nova'})
        delete_response = self.client.delete(self.room_url(room))

        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Room.objects.filter(pk=room.pk).exists())

    def test_profissional_nao_ve_salas_inativas(self):
        Room.objects.create(clinic=self.clinic, name='Sala Ativa')
        Room.objects.create(clinic=self.clinic, name='Sala Inativa', is_active=False)
        self.client.force_authenticate(self.professional)

        response = self.client.get(self.rooms_url())

        nomes = [room['name'] for room in response.data['results']]
        self.assertEqual(nomes, ['Sala Ativa'])

    def test_admin_ve_salas_inativas_para_gerenciar(self):
        Room.objects.create(clinic=self.clinic, name='Sala Ativa')
        Room.objects.create(clinic=self.clinic, name='Sala Inativa', is_active=False)
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.rooms_url())

        self.assertEqual(len(response.data['results']), 2)

    def test_admin_nao_acessa_salas_de_outra_clinica(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.rooms_url(self.other_clinic))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_nao_edita_sala_de_outra_clinica(self):
        room = Room.objects.create(clinic=self.other_clinic, name='Sala Alheia')
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.room_url(room, clinic=self.other_clinic), {'name': 'Invadida'}
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        room.refresh_from_db()
        self.assertEqual(room.name, 'Sala Alheia')

    def test_admin_pode_editar_e_desativar_sala(self):
        room = Room.objects.create(clinic=self.clinic, name='Sala 01')
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.room_url(room), {
            'name': 'Sala Principal',
            'is_active': False,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        room.refresh_from_db()
        self.assertEqual(room.name, 'Sala Principal')
        self.assertFalse(room.is_active)

    def test_admin_pode_reativar_sala(self):
        room = Room.objects.create(clinic=self.clinic, name='Sala 01', is_active=False)
        self.client.force_authenticate(self.admin)

        response = self.client.patch(self.room_url(room), {'is_active': True})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        room.refresh_from_db()
        self.assertTrue(room.is_active)

    def test_admin_exclui_sala_sem_historico(self):
        room = Room.objects.create(clinic=self.clinic, name='Sala 01')
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.room_url(room))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Room.objects.filter(pk=room.pk).exists())


class RoomDeletionWithHistoryTests(APITestCase):
    """Sala com consultas vinculadas nao pode ser excluida — apenas desativada."""

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Historico')
        cls.admin = User.objects.create_user(
            email='admin.hist@example.com', password='SenhaTeste123',
            full_name='Admin Historico', role=User.Role.ADMIN, clinic=cls.clinic,
        )
        professional_user = User.objects.create_user(
            email='prof.hist@example.com', password='SenhaTeste123',
            full_name='Profissional Historico', role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        cls.professional = ProfessionalProfile.objects.create(
            user=professional_user, crp='HIST-1'
        )
        patient_user = User.objects.create_user(
            email='paciente.hist@example.com', password='SenhaTeste123',
            full_name='Paciente Historico', role=User.Role.PATIENT,
            clinic=cls.clinic,
        )
        cls.patient = PatientProfile.objects.create(
            user=patient_user, assigned_professional=cls.professional
        )
        cls.room = Room.objects.create(clinic=cls.clinic, name='Sala com Historico')
        cls.appointment = Appointment.objects.create(
            patient=cls.patient, professional=cls.professional, clinic=cls.clinic,
            room=cls.room, scheduled_at=timezone.now() + timedelta(days=3),
            duration_minutes=50,
        )

    def room_url(self, room):
        return reverse('clinic-room-detail', args=[self.clinic.id, room.id])

    def test_exclusao_bloqueada_quando_ha_consultas_vinculadas(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.room_url(self.room))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Room.objects.filter(pk=self.room.pk).exists())
        self.assertTrue(Appointment.objects.filter(pk=self.appointment.pk).exists())

    def test_sala_desativada_continua_visivel_no_historico(self):
        self.room.is_active = False
        self.room.save(update_fields=['is_active'])
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            reverse('appointment-detail', args=[self.appointment.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['room_detail']['name'], 'Sala com Historico')


class RoomAvailabilityStatusTests(APITestCase):
    """
    Disponibilidade calculada: a listagem devolve `status` 'livre'/'ocupada'
    para o intervalo pedido, sem persistir estado no modelo.
    """

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Disponibilidade')
        cls.admin = User.objects.create_user(
            email='admin.disp@example.com', password='SenhaTeste123',
            full_name='Admin Disponibilidade', role=User.Role.ADMIN,
            clinic=cls.clinic,
        )
        professional_user = User.objects.create_user(
            email='prof.disp@example.com', password='SenhaTeste123',
            full_name='Profissional Disponibilidade',
            role=User.Role.PROFESSIONAL, clinic=cls.clinic,
        )
        cls.professional = ProfessionalProfile.objects.create(
            user=professional_user, crp='DISP-1'
        )
        patient_user = User.objects.create_user(
            email='paciente.disp@example.com', password='SenhaTeste123',
            full_name='Paciente Disponibilidade', role=User.Role.PATIENT,
            clinic=cls.clinic,
        )
        cls.patient = PatientProfile.objects.create(
            user=patient_user, assigned_professional=cls.professional
        )
        cls.room = Room.objects.create(clinic=cls.clinic, name='Sala 01')
        cls.inicio = (timezone.now() + timedelta(days=5)).replace(
            minute=0, second=0, microsecond=0
        )

    def agendar(self, start=None, duration=50, status_consulta='scheduled'):
        return Appointment.objects.create(
            patient=self.patient, professional=self.professional,
            clinic=self.clinic, room=self.room,
            scheduled_at=start or self.inicio, duration_minutes=duration,
            status=status_consulta,
        )

    def listar(self, **params):
        url = reverse('clinic-room-list', args=[self.clinic.id])
        return self.client.get(url, params)

    def test_sala_livre_quando_nao_ha_consulta_no_intervalo(self):
        self.client.force_authenticate(self.admin)

        response = self.listar(
            start=self.inicio.isoformat(),
            end=(self.inicio + timedelta(minutes=50)).isoformat(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['results'][0]['status'], 'livre')

    def test_sala_ocupada_quando_o_intervalo_se_sobrepoe(self):
        self.agendar()
        self.client.force_authenticate(self.admin)

        response = self.listar(
            start=(self.inicio + timedelta(minutes=30)).isoformat(),
            end=(self.inicio + timedelta(minutes=80)).isoformat(),
        )

        self.assertEqual(response.data['results'][0]['status'], 'ocupada')

    def test_sala_livre_no_intervalo_imediatamente_apos_o_fim(self):
        self.agendar()
        self.client.force_authenticate(self.admin)

        response = self.listar(
            start=(self.inicio + timedelta(minutes=50)).isoformat(),
            end=(self.inicio + timedelta(minutes=100)).isoformat(),
        )

        self.assertEqual(response.data['results'][0]['status'], 'livre')

    def test_consulta_cancelada_nao_ocupa_a_sala(self):
        self.agendar(status_consulta='cancelled')
        self.client.force_authenticate(self.admin)

        response = self.listar(
            start=self.inicio.isoformat(),
            end=(self.inicio + timedelta(minutes=50)).isoformat(),
        )

        self.assertEqual(response.data['results'][0]['status'], 'livre')

    def test_sem_intervalo_usa_a_situacao_atual(self):
        # Consulta acontecendo agora deixa a sala ocupada na consulta "sem filtro".
        self.agendar(start=timezone.now() - timedelta(minutes=10))
        self.client.force_authenticate(self.admin)

        response = self.listar()

        self.assertEqual(response.data['results'][0]['status'], 'ocupada')

    def test_apenas_o_fim_informado_usa_a_duracao_pedida(self):
        self.agendar()
        self.client.force_authenticate(self.admin)

        # Sem `end`, o intervalo considerado e instantaneo a partir de `start`.
        response = self.listar(start=(self.inicio + timedelta(minutes=10)).isoformat())

        self.assertEqual(response.data['results'][0]['status'], 'ocupada')

    def test_profissional_tambem_recebe_o_status_calculado(self):
        self.agendar()
        self.client.force_authenticate(self.professional.user)

        response = self.listar(
            start=self.inicio.isoformat(),
            end=(self.inicio + timedelta(minutes=50)).isoformat(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['results'][0]['status'], 'ocupada')

    def test_intervalo_invalido_e_rejeitado(self):
        self.client.force_authenticate(self.admin)

        response = self.listar(start='nao-e-uma-data')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
