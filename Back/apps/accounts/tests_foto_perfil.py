"""
Imagem do perfil (`photo_url`): cada perfil e responsavel pela propria imagem.

Paciente e psicologo usam a foto do seu perfil; o administrador representa a
clinica e usa a logo dela. Sem imagem, `photo_url` vem nulo e o frontend
mostra as iniciais.
"""
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.clinics.models import Clinic

from .models import PatientProfile, ProfessionalProfile, User

PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    b'\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
)

# Isola o storage: sem isto o teste gravaria no bucket real do .env (R2).
TEMP_MEDIA_ROOT = tempfile.mkdtemp(prefix='foto-perfil-tests-')


@override_settings(
    MEDIA_ROOT=TEMP_MEDIA_ROOT,
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
    },
)
class FotoDoPerfilTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.clinic = Clinic.objects.create(name='Clinica Foto')
        self.admin = User.objects.create_user(
            email='adm@foto.com', password='Senha-forte-123', full_name='Adm',
            role=User.Role.ADMIN, clinic=self.clinic,
        )
        self.psi = User.objects.create_user(
            email='psi@foto.com', password='Senha-forte-123', full_name='Psi',
            role=User.Role.PROFESSIONAL, clinic=self.clinic,
        )
        self.prof = ProfessionalProfile.objects.get_or_create(
            user=self.psi, defaults={'crp': '06/1'},
        )[0]
        self.pac = User.objects.create_user(
            email='pac@foto.com', password='Senha-forte-123', full_name='Pac',
            role=User.Role.PATIENT, clinic=self.clinic,
        )
        self.perfil_pac = PatientProfile.objects.get_or_create(
            user=self.pac, defaults={'assigned_professional': self.prof},
        )[0]

    def _me(self, user):
        self.client.force_authenticate(user)
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200, response.content)
        return response.data['photo_url']

    def test_sem_imagem_vem_nulo_para_as_iniciais(self):
        self.assertIsNone(self._me(self.admin))
        self.assertIsNone(self._me(self.psi))
        self.assertIsNone(self._me(self.pac))

    def test_admin_usa_a_logo_da_clinica(self):
        self.clinic.logo = SimpleUploadedFile('logo.png', PNG_BYTES, content_type='image/png')
        self.clinic.save()
        url = self._me(self.admin)
        self.assertTrue(url.startswith('http'), url)
        self.assertIn('clinics/logos/', url)

    def test_paciente_e_psicologo_usam_a_propria_foto(self):
        self.perfil_pac.photo = SimpleUploadedFile('p.png', PNG_BYTES, content_type='image/png')
        self.perfil_pac.save()
        self.prof.photo = SimpleUploadedFile('q.png', PNG_BYTES, content_type='image/png')
        self.prof.save()
        # A logo da clinica nao substitui a foto de ninguem.
        self.clinic.logo = SimpleUploadedFile('logo.png', PNG_BYTES, content_type='image/png')
        self.clinic.save()

        self.assertIn('patients/photos/', self._me(self.pac))
        self.assertIn('professionals/photos/', self._me(self.psi))

    def test_foto_aparece_nos_contatos_do_chat(self):
        self.prof.photo = SimpleUploadedFile('q.png', PNG_BYTES, content_type='image/png')
        self.prof.save()
        self.client.force_authenticate(self.pac)
        response = self.client.get('/api/chat/contacts/')
        self.assertEqual(response.status_code, 200, response.content)
        contato = next(c for c in response.data if c['id'] == str(self.psi.id))
        self.assertIn('professionals/photos/', contato['photo_url'])
