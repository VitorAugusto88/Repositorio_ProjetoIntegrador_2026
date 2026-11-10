"""
Chat — quem pode conversar com quem, mensagens não lidas e exclusão.

Regras: paciente ↔ psicólogo e qualquer um ↔ secretaria, sempre dentro da
mesma clínica. Paciente não conversa com paciente.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.clinics.models import Clinic

from .models import ChatMessage

SENHA = 'SenhaTeste123'


class ChatBase(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.clinica = Clinic.objects.create(name='Clinica Chat')
        cls.outra_clinica = Clinic.objects.create(name='Outra Clinica Chat')
        cls.admin = cls._user('admin.chat@example.com', User.Role.ADMIN, cls.clinica)
        cls.psicologo = cls._user('psi.chat@example.com', User.Role.PROFESSIONAL, cls.clinica)
        perfil_psi = ProfessionalProfile.objects.create(user=cls.psicologo, crp='CRP-CH')
        cls.paciente = cls._user('pac.chat@example.com', User.Role.PATIENT, cls.clinica)
        cls.outro_paciente = cls._user('outro.chat@example.com', User.Role.PATIENT, cls.clinica)
        for pac in (cls.paciente, cls.outro_paciente):
            PatientProfile.objects.create(user=pac, assigned_professional=perfil_psi)
        cls.psicologo_de_fora = cls._user(
            'psi.fora@example.com', User.Role.PROFESSIONAL, cls.outra_clinica,
        )

    @classmethod
    def _user(cls, email, role, clinica):
        return User.objects.create_user(
            email=email, password=SENHA, full_name=email.split('@')[0],
            role=role, clinic=clinica,
        )

    def _enviar(self, de, para, texto='Olá'):
        self.client.force_authenticate(user=de)
        return self.client.post(
            reverse('chat-messages'),
            {'receiver': str(para.id), 'content_encrypted': texto},
            format='json',
        )


class QuemPodeConversarTests(ChatBase):

    def test_paciente_envia_mensagem_ao_psicologo(self):
        response = self._enviar(self.paciente, self.psicologo)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        mensagem = ChatMessage.objects.get()
        self.assertEqual(mensagem.sender, self.paciente)  # remetente vem do token
        self.assertFalse(mensagem.read)

    def test_psicologo_responde_ao_paciente(self):
        response = self._enviar(self.psicologo, self.paciente)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_paciente_fala_com_a_secretaria(self):
        response = self._enviar(self.paciente, self.admin)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_paciente_nao_conversa_com_outro_paciente(self):
        response = self._enviar(self.paciente, self.outro_paciente)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ChatMessage.objects.exists())

    def test_ninguem_conversa_com_usuario_de_outra_clinica(self):
        response = self._enviar(self.paciente, self.psicologo_de_fora)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ChatMessage.objects.exists())

    def test_ninguem_envia_mensagem_para_si_mesmo(self):
        response = self._enviar(self.paciente, self.paciente)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remetente_nao_pode_ser_forjado(self):
        self.client.force_authenticate(user=self.paciente)
        self.client.post(
            reverse('chat-messages'),
            {
                'sender': str(self.psicologo.id),
                'receiver': str(self.psicologo.id),
                'content_encrypted': 'forjada',
            },
            format='json',
        )

        self.assertFalse(ChatMessage.objects.filter(sender=self.psicologo).exists())

    def test_lista_de_contatos_do_paciente_nao_inclui_outros_pacientes(self):
        self.client.force_authenticate(user=self.paciente)

        response = self.client.get(reverse('chat-contacts'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dados = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        ids = {str(c['id']) for c in dados}
        self.assertIn(str(self.psicologo.id), ids)
        self.assertIn(str(self.admin.id), ids)
        self.assertNotIn(str(self.outro_paciente.id), ids)
        self.assertNotIn(str(self.psicologo_de_fora.id), ids)

    def test_terceiro_nao_le_conversa_alheia(self):
        self._enviar(self.paciente, self.psicologo, 'Particular')
        self.client.force_authenticate(user=self.outro_paciente)

        response = self.client.get(reverse('chat-messages') + f'?with={self.psicologo.id}')

        self.assertNotIn('Particular', str(response.data))


class NaoLidasTests(ChatBase):

    def _nao_lidas(self, usuario):
        self.client.force_authenticate(user=usuario)
        return self.client.get(reverse('chat-unread')).data['unread_count']

    def test_contador_de_nao_lidas_e_leitura_da_conversa(self):
        self._enviar(self.paciente, self.psicologo, 'um')
        self._enviar(self.paciente, self.psicologo, 'dois')
        self.assertEqual(self._nao_lidas(self.psicologo), 2)
        self.assertEqual(self._nao_lidas(self.paciente), 0)  # quem enviou não conta

        self.client.force_authenticate(user=self.psicologo)
        self.client.patch(reverse('chat-read-conversation') + f'?with={self.paciente.id}')

        self.assertEqual(self._nao_lidas(self.psicologo), 0)

    def test_so_o_destinatario_marca_como_lida(self):
        self._enviar(self.paciente, self.psicologo)
        mensagem = ChatMessage.objects.get()

        self.client.force_authenticate(user=self.paciente)  # o remetente
        response = self.client.patch(reverse('chat-read', args=[mensagem.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        mensagem.refresh_from_db()
        self.assertFalse(mensagem.read)


class ExclusaoTests(ChatBase):

    def _apagar(self, usuario, mensagem, para_todos=False):
        self.client.force_authenticate(user=usuario)
        url = reverse('chat-message-delete', args=[mensagem.id])
        if para_todos:
            url += '?for_everyone=true'
        return self.client.delete(url)

    def test_apagar_para_mim_mantem_a_mensagem_para_o_outro(self):
        self._enviar(self.paciente, self.psicologo, 'oi')
        mensagem = ChatMessage.objects.get()

        self._apagar(self.paciente, mensagem)

        self.client.force_authenticate(user=self.paciente)
        do_paciente = self.client.get(reverse('chat-messages') + f'?with={self.psicologo.id}')
        self.client.force_authenticate(user=self.psicologo)
        do_psicologo = self.client.get(reverse('chat-messages') + f'?with={self.paciente.id}')
        self.assertNotIn('oi', str(do_paciente.data))
        self.assertIn('oi', str(do_psicologo.data))

    def test_apagar_para_todos_antes_de_ser_lida(self):
        self._enviar(self.paciente, self.psicologo)
        mensagem = ChatMessage.objects.get()

        response = self._apagar(self.paciente, mensagem, para_todos=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(ChatMessage.objects.exists())

    def test_mensagem_ja_lida_nao_pode_ser_apagada_para_todos(self):
        self._enviar(self.paciente, self.psicologo)
        mensagem = ChatMessage.objects.get()
        mensagem.read = True
        mensagem.save()

        response = self._apagar(self.paciente, mensagem, para_todos=True)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ChatMessage.objects.exists())

    def test_destinatario_nao_apaga_para_todos(self):
        self._enviar(self.paciente, self.psicologo)
        mensagem = ChatMessage.objects.get()

        response = self._apagar(self.psicologo, mensagem, para_todos=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ChatMessage.objects.exists())
