"""
Massa de teste dos testes ponta a ponta (Playwright).

Atende ao criterio de entrada do Plano de Teste: pelo menos duas clinicas,
dois psicologos e tres pacientes. A Clinica B existe para os testes de
isolamento (RN01): ela tem consulta, documento de paciente e documento avulso
que nenhum usuario da Clinica A pode alcancar.

So roda com config.settings_e2e: o comando apaga o banco antes de popular, e
nunca pode encostar no banco da nuvem do .env de desenvolvimento (R06).
"""

from datetime import time, timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment, Availability
from apps.clinics.models import Clinic, Room
from apps.records.models import Document

SENHA = 'SenhaE2e@2026'
PDF_VALIDO = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'


class Command(BaseCommand):
    help = 'Apaga o banco E2E e cria a massa de teste do Playwright.'

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE != 'config.settings_e2e':
            raise CommandError('Use --settings=config.settings_e2e.')

        call_command('flush', interactive=False, verbosity=0)

        clinica_a = Clinic.objects.create(name='Clinica Alfa')
        clinica_b = Clinic.objects.create(name='Clinica Beta')

        self._usuario('admin.a@e2e.local', 'Admin Alfa', User.Role.ADMIN, clinica_a)
        self._usuario('admin.b@e2e.local', 'Admin Beta', User.Role.ADMIN, clinica_b)

        psicologo_a = self._psicologo('psi.a@e2e.local', 'Dra. Ana Alfa', 'CRP-E2E-A', clinica_a)
        psicologo_b = self._psicologo('psi.b@e2e.local', 'Dr. Bruno Beta', 'CRP-E2E-B', clinica_b)

        self._paciente('paciente.a1@e2e.local', 'Paulo Alfa', clinica_a, psicologo_a)
        self._paciente('paciente.a2@e2e.local', 'Patricia Alfa', clinica_a, psicologo_a)
        paciente_b = self._paciente('paciente.b@e2e.local', 'Pedro Beta', clinica_b, psicologo_b)

        # Disponibilidade de segunda a sexta, 08h-18h. Sabado e domingo ficam
        # de fora para o teste de horario fora da disponibilidade.
        for psicologo in (psicologo_a, psicologo_b):
            for dia in range(5):
                Availability.objects.create(
                    professional=psicologo, weekday=dia,
                    start_time=time(8, 0), end_time=time(18, 0),
                )

        Room.objects.create(clinic=clinica_a, name='Sala Azul')
        Room.objects.create(clinic=clinica_b, name='Sala Beta')

        Appointment.objects.create(
            patient=paciente_b, professional=psicologo_b, clinic=clinica_b,
            scheduled_at=self._proximo_dia_util(10),
        )
        documento = Document(patient=paciente_b, clinic=clinica_b, title='Laudo Beta')
        documento.file.save('laudo-beta.pdf', ContentFile(PDF_VALIDO), save=True)
        avulso = Document(patient=None, clinic=clinica_b, title='Avulso Beta')
        avulso.file.save('avulso-beta.pdf', ContentFile(PDF_VALIDO), save=True)

        self.stdout.write(self.style.SUCCESS('Massa E2E criada.'))

    def _usuario(self, email, nome, papel, clinica):
        return User.objects.create_user(
            email=email, password=SENHA, full_name=nome, role=papel, clinic=clinica,
        )

    def _psicologo(self, email, nome, crp, clinica):
        usuario = self._usuario(email, nome, User.Role.PROFESSIONAL, clinica)
        return ProfessionalProfile.objects.create(user=usuario, crp=crp)

    def _paciente(self, email, nome, clinica, psicologo):
        usuario = self._usuario(email, nome, User.Role.PATIENT, clinica)
        return PatientProfile.objects.create(user=usuario, assigned_professional=psicologo)

    def _proximo_dia_util(self, hora):
        dia = timezone.localtime() + timedelta(days=1)
        while dia.weekday() >= 5:
            dia += timedelta(days=1)
        return dia.replace(hour=hora, minute=0, second=0, microsecond=0)
