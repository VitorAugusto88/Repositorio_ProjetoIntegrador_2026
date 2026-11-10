"""
RN05 — Autenticação e sessão.

Cobre o caminho completo de quem entra e sai do sistema: login, logout,
recuperação de senha e bloqueio de conta desativada. Cada evento sensível
precisa deixar rastro na auditoria (LGPD).
"""

import re

from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.clinics.models import Clinic

from .models import PatientProfile, ProfessionalProfile, User

SENHA = 'SenhaTeste123'


class AutenticacaoBase(APITestCase):

    def setUp(self):
        cache.clear()  # zera o throttle de login (5/min) entre os testes
        self.clinica = Clinic.objects.create(name='Clinica Auth')
        self.admin = User.objects.create_user(
            email='admin.auth@example.com', password=SENHA, full_name='Admin Auth',
            role=User.Role.ADMIN, clinic=self.clinica,
        )
        psi_user = User.objects.create_user(
            email='psi.auth@example.com', password=SENHA, full_name='José Psicólogo',
            role=User.Role.PROFESSIONAL, clinic=self.clinica,
        )
        self.psicologo = ProfessionalProfile.objects.create(user=psi_user, crp='CRP-AU')
        self.paciente_user = User.objects.create_user(
            email='pac.auth@example.com', password=SENHA, full_name='Paciente Auth',
            role=User.Role.PATIENT, clinic=self.clinica,
        )
        PatientProfile.objects.create(
            user=self.paciente_user, assigned_professional=self.psicologo,
        )

    def _login(self, email, senha=SENHA):
        return self.client.post(
            reverse('login'), {'email': email, 'password': senha}, format='json',
        )


class LoginTests(AutenticacaoBase):

    def test_login_valido_devolve_access_e_refresh(self):
        response = self._login('pac.auth@example.com')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_token_leva_papel_nome_e_clinica_para_o_app_rotear(self):
        response = self._login('psi.auth@example.com')
        token = AccessToken(response.data['access'])

        self.assertEqual(token['role'], 'professional')
        self.assertEqual(token['full_name'], 'José Psicólogo')
        self.assertEqual(token['clinic_id'], str(self.clinica.id))

    def test_email_ignora_maiusculas(self):
        response = self._login('PAC.Auth@Example.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_senha_errada_e_recusada(self):
        response = self._login('pac.auth@example.com', 'senha-errada')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)

    def test_email_inexistente_e_recusado(self):
        response = self._login('ninguem@example.com')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_conta_desativada_pelo_admin_nao_entra(self):
        self.client.force_authenticate(user=self.admin)
        desativar = self.client.patch(
            reverse('admin-user-status', args=[self.paciente_user.id]),
            {'is_active': False}, format='json',
        )
        self.assertEqual(desativar.status_code, status.HTTP_200_OK, desativar.data)
        self.client.force_authenticate(user=None)

        response = self._login('pac.auth@example.com')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_excesso_de_tentativas_e_bloqueado(self):
        # Proteção contra força bruta: 5 tentativas por minuto.
        for _ in range(5):
            self._login('pac.auth@example.com', 'senha-errada')

        response = self._login('pac.auth@example.com')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_login_valido_fica_registrado_na_auditoria(self):
        self._login('pac.auth@example.com')

        log = AuditLog.objects.get(action=AuditLog.Action.USER_LOGIN)
        self.assertEqual(log.target_id, str(self.paciente_user.id))

    def test_login_falho_fica_registrado_sem_guardar_a_senha(self):
        self._login('pac.auth@example.com', 'senha-errada')

        log = AuditLog.objects.get(action=AuditLog.Action.USER_LOGIN_FAILED)
        self.assertEqual(log.target_repr, 'pac.auth@example.com')
        self.assertNotIn('senha-errada', str(log.metadata))


class LogoutTests(AutenticacaoBase):

    def _logout(self, login):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')
        return self.client.post(
            reverse('logout'), {'refresh': login.data['refresh']}, format='json',
        )

    def test_logout_invalida_o_refresh_token(self):
        login = self._login('pac.auth@example.com')
        response = self._logout(login)
        self.assertLess(response.status_code, 300)

        self.client.credentials()
        renovar = self.client.post(
            reverse('token_refresh'), {'refresh': login.data['refresh']}, format='json',
        )
        self.assertEqual(renovar.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_fica_registrado_na_auditoria(self):
        login = self._login('pac.auth@example.com')
        self._logout(login)

        log = AuditLog.objects.filter(action=AuditLog.Action.USER_LOGOUT).first()
        self.assertIsNotNone(log, 'O logout não gerou registro de auditoria')
        self.assertEqual(log.actor_id, self.paciente_user.id)

    def test_logout_sem_refresh_e_recusado(self):
        login = self._login('pac.auth@example.com')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login.data["access"]}')

        response = self.client.post(reverse('logout'), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_exige_estar_logado(self):
        response = self.client.post(reverse('logout'), {'refresh': 'x'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class RecuperacaoDeSenhaTests(AutenticacaoBase):

    def _pedir_recuperacao(self, email):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                reverse('password-reset-request'), {'email': email}, format='json',
            )

    def test_email_existente_recebe_link_de_recuperacao(self):
        response = self._pedir_recuperacao('pac.auth@example.com')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['pac.auth@example.com'])
        self.assertRegex(mail.outbox[0].body, r'uid=[^&\s]+&token=[^&\s]+')

    def test_email_inexistente_tem_a_mesma_resposta_e_nao_envia_nada(self):
        # Não revela quais e-mails estão cadastrados (enumeração de usuários).
        existente = self._pedir_recuperacao('pac.auth@example.com')
        cache.clear()
        inexistente = self._pedir_recuperacao('ninguem@example.com')

        self.assertEqual(inexistente.status_code, existente.status_code)
        self.assertEqual(inexistente.data, existente.data)
        self.assertEqual(len(mail.outbox), 1)  # só o do e-mail existente

    def test_link_do_email_troca_a_senha_e_so_vale_uma_vez(self):
        self._pedir_recuperacao('pac.auth@example.com')
        link = re.search(r'uid=([^&\s]+)&token=([^&\s]+)', mail.outbox[0].body)
        corpo = {'uid': link.group(1), 'token': link.group(2), 'password': 'NovaSenha#2026'}

        confirmar = self.client.post(reverse('password-reset-confirm'), corpo, format='json')
        self.assertEqual(confirmar.status_code, status.HTTP_200_OK, confirmar.data)

        self.assertEqual(self._login('pac.auth@example.com').status_code, 401)
        self.assertEqual(
            self._login('pac.auth@example.com', 'NovaSenha#2026').status_code, 200,
        )

        reuso = self.client.post(reverse('password-reset-confirm'), corpo, format='json')
        self.assertEqual(reuso.status_code, status.HTTP_400_BAD_REQUEST)

    def test_token_falso_e_recusado(self):
        response = self.client.post(
            reverse('password-reset-confirm'),
            {'uid': 'abc', 'token': 'falso', 'password': 'NovaSenha#2026'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
