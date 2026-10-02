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
class SecretaryDocumentAccessTests(TestCase):
    """Documento clinico (vinculado a paciente) e exclusivo do psicologo."""

    @classmethod
    def setUpTestData(cls):
        from apps.accounts.models import PatientProfile, ProfessionalProfile, User
        from apps.clinics.models import Clinic

        from .models import Document

        cls.clinic = Clinic.objects.create(name='Clinica')
        cls.admin = User.objects.create_user(
            email='sec@x.com', password='Senha-forte-123', full_name='Sec',
            role=User.Role.ADMIN, clinic=cls.clinic,
        )
        cls.psi = User.objects.create_user(
            email='psi@x.com', password='Senha-forte-123', full_name='Psi',
            role=User.Role.PROFESSIONAL, clinic=cls.clinic,
        )
        patient_user = User.objects.create_user(
            email='pac@x.com', password='Senha-forte-123', full_name='Pac',
            role=User.Role.PATIENT, clinic=cls.clinic,
        )
        cls.patient_user = patient_user
        prof = ProfessionalProfile.objects.get_or_create(
            user=cls.psi, defaults={'crp': '06/12345'},
        )[0]
        profile = PatientProfile.objects.get_or_create(
            user=patient_user, defaults={'assigned_professional': prof},
        )[0]
        cls.clinical = Document.objects.create(
            patient=profile, clinic=cls.clinic, title='Laudo',
            file=SimpleUploadedFile('a.pdf', PDF_BYTES),
        )
        cls.avulso = Document.objects.create(
            clinic=cls.clinic, title='Contrato',
            file=SimpleUploadedFile('b.pdf', PDF_BYTES),
        )

    def _ids(self, user):
        from .views import get_documents_for_user
        return set(get_documents_for_user(user).values_list('id', flat=True))

    def test_admin_ve_apenas_documentos_avulsos(self):
        self.assertEqual(self._ids(self.admin), {self.avulso.id})

    def test_psicologo_ve_documento_clinico(self):
        self.assertIn(self.clinical.id, self._ids(self.psi))

    def test_admin_recebe_404_no_download_clinico(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.get(f'/api/records/documents/{self.clinical.id}/download/')
        self.assertEqual(response.status_code, 404)

    def test_admin_nao_anexa_documento_a_paciente(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.post('/api/records/documents/', {
            'title': 'X', 'patient': str(self.clinical.patient_id),
            'file': SimpleUploadedFile('c.pdf', PDF_BYTES, content_type='application/pdf'),
        }, format='multipart')
        self.assertEqual(response.status_code, 403, response.content)

    def test_admin_nao_ve_campos_clinicos_do_perfil(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.get(f'/api/auth/patients/{self.patient_user.id}/profile/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn('anamnesis', response.data)
        self.assertNotIn('medical_history', response.data)
        client.force_authenticate(self.psi)
        response = client.get(f'/api/auth/patients/{self.patient_user.id}/profile/')
        self.assertIn('anamnesis', response.data)
