from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clinics.models import Clinic

from .models import PatientProfile, ProfessionalProfile, User


class ChangePasswordTests(APITestCase):
    def setUp(self):
        self.url = reverse('password-change')
        self.current_password = 'SenhaAtual123'
        self.user = User.objects.create_user(
            email='paciente@example.com',
            password=self.current_password,
            full_name='Paciente Teste',
            role=User.Role.PATIENT,
        )
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NovaSenhaForte456'))
        self.assertFalse(self.user.check_password(self.current_password))

    def test_wrong_current_password_is_rejected(self):
        response = self.client.post(
            self.url,
            {
                'current_password': 'SenhaErrada000',
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.current_password))

    def test_weak_new_password_is_rejected(self):
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': '123',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.current_password))

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AssignedProfessionalAccountTests(APITestCase):
    """
    Vinculo paciente -> psicologo: definido pelo admin no cadastro, invisivel
    para a escolha do paciente e obrigatorio para remover o psicologo.
    """

    def setUp(self):
        self.clinic = Clinic.objects.create(name='Clinica Vinculo')
        self.outra_clinic = Clinic.objects.create(name='Outra Clinica')

        self.admin = User.objects.create_user(
            email='admin@example.com',
            password='SenhaTeste123',
            full_name='Admin',
            role=User.Role.ADMIN,
            clinic=self.clinic,
        )
        self.psicologo = self._professional('psi@example.com', 'CRP-1', self.clinic)
        self.psicologo_de_fora = self._professional(
            'externo@example.com', 'CRP-2', self.outra_clinic
        )
        self.client.force_authenticate(user=self.admin)

    def _professional(self, email, crp, clinic):
        user = User.objects.create_user(
            email=email,
            password='SenhaTeste123',
            full_name=f'Psicologo {crp}',
            role=User.Role.PROFESSIONAL,
            clinic=clinic,
        )
        return ProfessionalProfile.objects.create(user=user, crp=crp)

    def _payload(self, **extra):
        payload = {
            'email': 'novo.paciente@example.com',
            'full_name': 'Novo Paciente',
            'send_invite': False,
        }
        payload.update(extra)
        return payload

    # ── Cadastro ────────────────────────────────────────────────────────────

    def test_cadastro_sem_psicologo_e_recusado(self):
        response = self.client.post(
            reverse('admin-patient-create'), self._payload()
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_professional', response.data)
        self.assertFalse(User.objects.filter(email='novo.paciente@example.com').exists())

    def test_cadastro_com_psicologo_de_outra_clinica_e_recusado(self):
        response = self.client.post(
            reverse('admin-patient-create'),
            self._payload(assigned_professional=str(self.psicologo_de_fora.id)),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_professional', response.data)

    def test_cadastro_valido_cria_o_vinculo(self):
        response = self.client.post(
            reverse('admin-patient-create'),
            self._payload(assigned_professional=str(self.psicologo.id)),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        paciente = User.objects.get(email='novo.paciente@example.com')
        self.assertEqual(
            paciente.patient_profile.assigned_professional_id, self.psicologo.id
        )

    # ── O paciente nao altera o proprio vinculo ─────────────────────────────

    def test_paciente_nao_altera_o_proprio_psicologo(self):
        paciente_user = User.objects.create_user(
            email='paciente@example.com',
            password='SenhaTeste123',
            full_name='Paciente',
            role=User.Role.PATIENT,
            clinic=self.clinic,
        )
        perfil = PatientProfile.objects.create(
            user=paciente_user, assigned_professional=self.psicologo
        )
        outro = self._professional('outro@example.com', 'CRP-3', self.clinic)

        self.client.force_authenticate(user=paciente_user)
        self.client.patch(
            reverse('patient_profile', args=[paciente_user.id]),
            {'assigned_professional': str(outro.id)},
        )

        # O campo e somente-leitura para o paciente: o PATCH nao falha, mas o
        # vinculo continua o mesmo. Trocar de psicologo passa pelo admin.
        perfil.refresh_from_db()
        self.assertEqual(perfil.assigned_professional_id, self.psicologo.id)

    def test_paciente_continua_vendo_quem_e_o_seu_psicologo(self):
        paciente_user = User.objects.create_user(
            email='paciente2@example.com',
            password='SenhaTeste123',
            full_name='Paciente',
            role=User.Role.PATIENT,
            clinic=self.clinic,
        )
        PatientProfile.objects.create(
            user=paciente_user, assigned_professional=self.psicologo
        )

        self.client.force_authenticate(user=paciente_user)
        response = self.client.get(
            reverse('patient_profile', args=[paciente_user.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['assigned_professional'], self.psicologo.id
        )
        self.assertEqual(
            response.data['assigned_professional_detail']['user']['full_name'],
            'Psicologo CRP-1',
        )

    # ── Remocao do psicologo ────────────────────────────────────────────────

    def _paciente_vinculado(self, professional):
        user = User.objects.create_user(
            email='vinculado@example.com',
            password='SenhaTeste123',
            full_name='Paciente Vinculado',
            role=User.Role.PATIENT,
            clinic=self.clinic,
        )
        return PatientProfile.objects.create(
            user=user, assigned_professional=professional
        )

    def test_nao_exclui_psicologo_com_pacientes(self):
        self._paciente_vinculado(self.psicologo)

        response = self.client.delete(
            reverse('admin-user-detail', args=[self.psicologo.user_id])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Transfira esses pacientes', response.data['detail'])
        self.assertTrue(User.objects.filter(id=self.psicologo.user_id).exists())

    def test_nao_arquiva_psicologo_com_pacientes(self):
        """
        O caminho que preserva dados clinicos nao passa pelo PROTECT do banco,
        entao precisa da mesma trava — senao o paciente ficaria presos a um
        profissional inativo, sem aviso.
        """
        self._paciente_vinculado(self.psicologo)

        response = self.client.delete(
            reverse('admin-user-detail', args=[self.psicologo.user_id])
            + '?preserve_clinical_data=true'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.psicologo.user.refresh_from_db()
        self.assertFalse(self.psicologo.user.is_archived)

    def test_exclui_psicologo_sem_pacientes(self):
        response = self.client.delete(
            reverse('admin-user-detail', args=[self.psicologo.user_id])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.psicologo.user_id).exists())
