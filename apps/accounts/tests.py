import re
from datetime import timedelta

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

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


class ClinicPatientListTests(APITestCase):
    """
    GET /api/auth/<clinic_id>/patients/ — a lista que alimenta o card
    "Pacientes" do psicologo. Ele precisa enxergar quem esta sob a sua
    responsabilidade mesmo antes da primeira consulta ser marcada.
    """

    def setUp(self):
        self.clinic = Clinic.objects.create(name='Clinica Lista')
        self.psicologo = self._professional('psi.lista@example.com', 'CRP-L1')
        self.outro_psicologo = self._professional('psi2.lista@example.com', 'CRP-L2')
        self.url = reverse('clinic-patient-list', args=[self.clinic.id])

    def _professional(self, email, crp):
        user = User.objects.create_user(
            email=email,
            password='SenhaTeste123',
            full_name=f'Psicologo {crp}',
            role=User.Role.PROFESSIONAL,
            clinic=self.clinic,
        )
        return ProfessionalProfile.objects.create(user=user, crp=crp)

    def _paciente(self, email, professional, is_active=True):
        user = User.objects.create_user(
            email=email,
            password='SenhaTeste123',
            full_name=f'Paciente {email}',
            role=User.Role.PATIENT,
            clinic=self.clinic,
            is_active=is_active,
        )
        return PatientProfile.objects.create(
            user=user, assigned_professional=professional
        )

    def _ids(self, response):
        return {item['id'] for item in response.data.get('results', response.data)}

    def test_psicologo_ve_paciente_vinculado_sem_consulta(self):
        """O bug: paciente atribuido, porem ainda sem consulta, sumia da lista."""
        perfil = self._paciente('sem.consulta@example.com', self.psicologo)

        self.client.force_authenticate(user=self.psicologo.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(perfil.id), self._ids(response))

    def test_psicologo_nao_ve_paciente_de_outro_psicologo(self):
        alheio = self._paciente('alheio@example.com', self.outro_psicologo)

        self.client.force_authenticate(user=self.psicologo.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(alheio.id), self._ids(response))

    def test_paciente_inativo_fica_fora_da_lista(self):
        inativo = self._paciente(
            'inativo@example.com', self.psicologo, is_active=False
        )

        self.client.force_authenticate(user=self.psicologo.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(inativo.id), self._ids(response))

    def test_paciente_aparece_uma_unica_vez_com_varias_consultas(self):
        """O OR com appointments nao pode duplicar linhas na lista."""
        from django.utils import timezone
        from datetime import timedelta

        from apps.appointments.models import Appointment

        perfil = self._paciente('com.consultas@example.com', self.psicologo)
        for dias in (1, 2, 3):
            Appointment.objects.create(
                patient=perfil,
                professional=self.psicologo,
                clinic=self.clinic,
                scheduled_at=timezone.now() + timedelta(days=dias),
            )

        self.client.force_authenticate(user=self.psicologo.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        encontrados = [
            item for item in response.data.get('results', response.data)
            if item['id'] == str(perfil.id)
        ]
        self.assertEqual(len(encontrados), 1)

    def test_psicologo_ainda_ve_paciente_remanejado_com_quem_ja_atendeu(self):
        """Historico nao pode sumir quando o admin troca o psicologo responsavel."""
        from django.utils import timezone
        from datetime import timedelta

        from apps.appointments.models import Appointment

        perfil = self._paciente('remanejado@example.com', self.outro_psicologo)
        Appointment.objects.create(
            patient=perfil,
            professional=self.psicologo,
            clinic=self.clinic,
            scheduled_at=timezone.now() - timedelta(days=10),
        )

        self.client.force_authenticate(user=self.psicologo.user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(str(perfil.id), self._ids(response))

    def test_lista_paginada_entrega_todos_os_pacientes_sem_repetir(self):
        """
        A resposta e paginada (PAGE_SIZE=20) e o frontend segue o campo `next`
        ate o fim. Isso exige que as paginas nao se sobreponham nem percam
        registros — o que so vale com a ordenacao explicita no queryset.
        """
        criados = {
            str(self._paciente(f'p{i:02d}@example.com', self.psicologo).id)
            for i in range(25)
        }

        self.client.force_authenticate(user=self.psicologo.user)

        vistos = []
        url = self.url
        paginas = 0
        while url and paginas < 10:
            paginas += 1
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            vistos.extend(item['id'] for item in response.data['results'])
            url = response.data['next']

        self.assertEqual(paginas, 2)
        self.assertEqual(len(vistos), 25, 'houve pagina repetida ou perdida')
        self.assertEqual(set(vistos), criados)


class InviteOnlyRegistrationTests(APITestCase):
    """
    R04 / RN02: nao existe cadastro publico. So o administrador cria usuarios,
    por convite enviado por e-mail, e o convidado define a propria senha.
    """

    def setUp(self):
        cache.clear()  # zera o throttle de login entre os testes
        self.clinic = Clinic.objects.create(name='Clinica Convite')
        self.admin = User.objects.create_user(
            email='admin.convite@example.com',
            password='SenhaTeste123',
            full_name='Admin',
            role=User.Role.ADMIN,
            clinic=self.clinic,
        )
        psicologo_user = User.objects.create_user(
            email='psi.convite@example.com',
            password='SenhaTeste123',
            full_name='Psicologo',
            role=User.Role.PROFESSIONAL,
            clinic=self.clinic,
        )
        self.psicologo = ProfessionalProfile.objects.create(user=psicologo_user, crp='CRP-CV')

    def test_cadastro_publico_continua_desativado(self):
        response = self.client.post(
            '/api/auth/register/',
            {
                'email': 'intruso@example.com',
                'password': 'SenhaTeste123',
                'full_name': 'Intruso',
                'role': 'patient',
            },
            format='json',
        )

        self.assertGreaterEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='intruso@example.com').exists())

    def test_convite_do_admin_cria_o_usuario_e_permite_definir_a_senha(self):
        self.client.force_authenticate(user=self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse('admin-patient-create'),
                {
                    'email': 'convidado@example.com',
                    'full_name': 'Convidado',
                    'assigned_professional': str(self.psicologo.id),
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        convidado = User.objects.get(email='convidado@example.com')
        self.assertEqual(convidado.clinic_id, self.clinic.id)
        self.assertFalse(convidado.has_usable_password())

        # O link do e-mail traz uid e token para a tela de definir senha.
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['convidado@example.com'])
        link = re.search(r'uid=([^&\s]+)&token=([^&\s]+)', mail.outbox[0].body)
        self.assertIsNotNone(link)

        self.client.force_authenticate(user=None)
        confirmado = self.client.post(
            reverse('password-invite-confirm'),
            {'uid': link.group(1), 'token': link.group(2), 'password': 'SenhaConvidado987'},
            format='json',
        )
        self.assertEqual(confirmado.status_code, status.HTTP_200_OK, confirmado.data)

        login = self.client.post(
            reverse('login'),
            {'email': 'convidado@example.com', 'password': 'SenhaConvidado987'},
            format='json',
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)

    def test_paciente_e_psicologo_nao_criam_usuarios(self):
        paciente = User.objects.create_user(
            email='paciente.cv@example.com',
            password='SenhaTeste123',
            full_name='Paciente',
            role=User.Role.PATIENT,
            clinic=self.clinic,
        )
        for usuario in (paciente, self.psicologo.user):
            with self.subTest(role=usuario.role):
                self.client.force_authenticate(user=usuario)
                response = self.client.post(
                    reverse('admin-patient-create'),
                    {
                        'email': f'novo-{usuario.role}@example.com',
                        'full_name': 'Novo',
                        'send_invite': False,
                        'assigned_professional': str(self.psicologo.id),
                    },
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SessionTokenTests(APITestCase):
    """RN05 / R03: token de 15 minutos, e cada renovacao invalida a anterior."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='sessao@example.com',
            password='SenhaTeste123',
            full_name='Sessao',
            role=User.Role.ADMIN,
            clinic=Clinic.objects.create(name='Clinica Sessao'),
        )

    def test_access_token_expira_em_15_minutos(self):
        self.assertEqual(
            settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'], timedelta(minutes=15)
        )

    def test_token_vencido_e_recusado(self):
        token = AccessToken.for_user(self.user)
        token.set_exp(from_time=timezone.now() - timedelta(minutes=16))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        self.assertEqual(self.client.get(reverse('me')).status_code, 401)

    def test_renovacao_invalida_o_refresh_anterior(self):
        login = self.client.post(
            reverse('login'),
            {'email': 'sessao@example.com', 'password': 'SenhaTeste123'},
            format='json',
        )
        antigo = login.data['refresh']

        primeira = self.client.post(reverse('token_refresh'), {'refresh': antigo}, format='json')
        self.assertEqual(primeira.status_code, status.HTTP_200_OK)
        self.assertNotEqual(primeira.data['refresh'], antigo)

        # Duas telas renovando com o mesmo refresh: a segunda e recusada.
        reuso = self.client.post(reverse('token_refresh'), {'refresh': antigo}, format='json')
        self.assertEqual(reuso.status_code, status.HTTP_401_UNAUTHORIZED)
