import shutil
import tempfile
from types import SimpleNamespace

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.accounts.models import User
from apps.clinics.models import Clinic

from .models import ChatMessage
from .serializers import ChatMessageSerializer

# Cabecalhos reais de cada formato — os anexos precisam ter conteudo coerente
# com a extensao informada.
PDF_BYTES = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< >>\nendobj\ntrailer\n'
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    b'\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
)


# Os testes salvam anexos de verdade. Sem este override eles iriam para o
# storage configurado no .env (R2), deixando lixo no bucket real.
TEMP_MEDIA_ROOT = tempfile.mkdtemp(prefix='chat-tests-')


@override_settings(
    MEDIA_ROOT=TEMP_MEDIA_ROOT,
    STORAGES={
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    },
)
class ChatAttachmentTypeTests(TestCase):
    """
    O chat aceita os mesmos tipos de anexo permitidos nos documentos
    (PDF/DOC/DOCX), alem das imagens e audios que ja aceitava.
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        cls.clinic = Clinic.objects.create(name='Clinica Teste')
        cls.professional = User.objects.create_user(
            email='psicologo@example.com',
            password='SenhaTeste123',
            full_name='Psicologo Teste',
            role=User.Role.PROFESSIONAL,
            clinic=cls.clinic,
        )
        cls.patient = User.objects.create_user(
            email='paciente@example.com',
            password='SenhaTeste123',
            full_name='Paciente Teste',
            role=User.Role.PATIENT,
            clinic=cls.clinic,
        )

    def _serializer(self, upload):
        return ChatMessageSerializer(
            data={'receiver': str(self.patient.id), 'attachment': upload},
            context={'request': SimpleNamespace(user=self.professional)},
        )

    def test_pdf_e_aceito_e_classificado_como_arquivo(self):
        upload = SimpleUploadedFile(
            'exame.pdf', PDF_BYTES, content_type='application/pdf'
        )
        serializer = self._serializer(upload)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        message = serializer.save(sender=self.professional)

        self.assertEqual(message.message_type, ChatMessage.MessageType.FILE)
        # Nome original preservado para exibir no card do documento.
        self.assertEqual(message.media_name, 'exame.pdf')
        self.assertTrue(message.media_url)

    def test_imagem_continua_sendo_classificada_como_imagem(self):
        upload = SimpleUploadedFile(
            'foto.png', PNG_BYTES, content_type='image/png'
        )
        serializer = self._serializer(upload)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        message = serializer.save(sender=self.professional)
        self.assertEqual(message.message_type, ChatMessage.MessageType.IMAGE)

    def test_docx_e_aceito_e_classificado_como_arquivo(self):
        # docx e um zip: assinatura PK\x03\x04.
        upload = SimpleUploadedFile(
            'laudo.docx',
            b'PK\x03\x04' + b'\x00' * 32,
            content_type=(
                'application/vnd.openxmlformats-officedocument'
                '.wordprocessingml.document'
            ),
        )
        serializer = self._serializer(upload)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        message = serializer.save(sender=self.professional)
        self.assertEqual(message.message_type, ChatMessage.MessageType.FILE)

    def test_extensao_fora_da_lista_e_rejeitada(self):
        upload = SimpleUploadedFile(
            'script.exe', b'MZ\x90\x00', content_type='application/octet-stream'
        )
        serializer = self._serializer(upload)

        self.assertFalse(serializer.is_valid())

    def test_conteudo_incompativel_com_a_extensao_e_rejeitado(self):
        # Extensao diz PDF, conteudo e uma imagem PNG.
        upload = SimpleUploadedFile(
            'falso.pdf', PNG_BYTES, content_type='application/pdf'
        )
        serializer = self._serializer(upload)

        self.assertFalse(serializer.is_valid())
