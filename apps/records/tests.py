import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .serializers import DocumentSerializer

PDF_BYTES = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< >>\nendobj\ntrailer\n'
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    b'\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
)

# Sem este override os testes gravariam no storage do .env (R2), sujando o
# bucket real — o Django nao isola storage em teste como isola o banco.
TEMP_MEDIA_ROOT = tempfile.mkdtemp(prefix='records-tests-')


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
class DocumentUploadValidationTests(TestCase):
    """
    validate_file precisa ser chamado pelo DRF. Enquanto era uma funcao solta
    no modulo (fora da classe), o upload de documentos aceitava qualquer
    arquivo — estes testes garantem que a regra esta ativa.
    """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def _serializer(self, upload):
        return DocumentSerializer(data={'title': 'Exame', 'file': upload})

    def test_pdf_valido_e_aceito(self):
        upload = SimpleUploadedFile(
            'exame.pdf', PDF_BYTES, content_type='application/pdf'
        )
        serializer = self._serializer(upload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_imagem_valida_e_aceita(self):
        upload = SimpleUploadedFile(
            'raio-x.png', PNG_BYTES, content_type='image/png'
        )
        serializer = self._serializer(upload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_extensao_nao_permitida_e_rejeitada(self):
        upload = SimpleUploadedFile(
            'script.exe', b'MZ\x90\x00', content_type='application/octet-stream'
        )
        serializer = self._serializer(upload)

        self.assertFalse(serializer.is_valid())
        self.assertIn('file', serializer.errors)

    def test_conteudo_incompativel_com_a_extensao_e_rejeitado(self):
        # Extensao diz PDF, conteudo e um executavel.
        upload = SimpleUploadedFile(
            'disfarcado.pdf', b'MZ\x90\x00' + b'\x00' * 64,
            content_type='application/pdf',
        )
        serializer = self._serializer(upload)

        self.assertFalse(serializer.is_valid())
        self.assertIn('file', serializer.errors)

    def test_arquivo_acima_de_10mb_e_rejeitado(self):
        grande = PDF_BYTES + b'\x00' * (10 * 1024 * 1024)
        upload = SimpleUploadedFile(
            'gigante.pdf', grande, content_type='application/pdf'
        )
        serializer = self._serializer(upload)

        self.assertFalse(serializer.is_valid())
        self.assertIn('file', serializer.errors)
