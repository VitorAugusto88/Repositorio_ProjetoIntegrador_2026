"""
Relatórios — números corretos, filtro de período, exportação PDF/Excel e
quem pode ver o relatório de quem.

Até esta rodada o app `reports` não tinha nenhum teste.
"""

from datetime import datetime

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PatientProfile, ProfessionalProfile, User
from apps.appointments.models import Appointment
from apps.clinics.models import Clinic

SENHA = 'SenhaTeste123'
S = Appointment.Status


def _data(ano, mes, dia, hora=10):
    return timezone.make_aware(datetime(ano, mes, dia, hora, 0))


class RelatoriosBase(APITestCase):

    @classmethod
    def setUpTestData(cls):
        cls.clinica = Clinic.objects.create(name='Clinica Relatorio')
        cls.admin = cls._user('admin.rel@example.com', User.Role.ADMIN)
        cls.psicologo = cls._psicologo('psi.rel@example.com', 'Ana Psicologa')
        cls.outro_psicologo = cls._psicologo('outro.rel@example.com', 'Bruno Psicologo')
        cls.paciente = cls._paciente('pac.rel@example.com', 'Paulo Paciente', cls.psicologo)
        cls.outro_paciente = cls._paciente('outro.pac.rel@example.com', 'Pedro Paciente', cls.outro_psicologo)

        # Massa conhecida: 10 consultas do Paulo com a Ana em jan e fev/2026.
        #   jan: 3 realizadas, 1 falta, 1 cancelada
        #   fev: 2 realizadas, 1 cancelada, 1 agendada, 1 remarcada
        cls._muitas(cls.paciente, cls.psicologo, 2026, 1, [S.COMPLETED] * 3 + [S.NO_SHOW, S.CANCELLED])
        cls._muitas(cls.paciente, cls.psicologo, 2026, 2,
                    [S.COMPLETED] * 2 + [S.CANCELLED, S.SCHEDULED, S.RESCHEDULED])
        # Outro par, para garantir que um relatório não "vaza" o outro.
        cls._muitas(cls.outro_paciente, cls.outro_psicologo, 2026, 1, [S.COMPLETED, S.COMPLETED])

    @classmethod
    def _user(cls, email, role, nome=None):
        return User.objects.create_user(
            email=email, password=SENHA, full_name=nome or email.split('@')[0],
            role=role, clinic=cls.clinica,
        )

    @classmethod
    def _psicologo(cls, email, nome):
        return ProfessionalProfile.objects.create(
            user=cls._user(email, User.Role.PROFESSIONAL, nome), crp=email[:8],
        )

    @classmethod
    def _paciente(cls, email, nome, psicologo):
        return PatientProfile.objects.create(
            user=cls._user(email, User.Role.PATIENT, nome), assigned_professional=psicologo,
        )

    @classmethod
    def _muitas(cls, paciente, psicologo, ano, mes, status_list):
        for dia, status_consulta in enumerate(status_list, start=2):
            Appointment.objects.create(
                patient=paciente, professional=psicologo, clinic=cls.clinica,
                scheduled_at=_data(ano, mes, dia), status=status_consulta,
            )

    def _get(self, usuario, url):
        self.client.force_authenticate(user=usuario)
        return self.client.get(url)


class RelatorioDoPacienteTests(RelatoriosBase):

    def _url(self, paciente, **periodo):
        url = reverse('report-patient', args=[paciente.id])
        if periodo:
            url += '?' + '&'.join(f'{k}={v}' for k, v in periodo.items())
        return url

    def test_totais_por_status_batem_com_as_consultas(self):
        response = self._get(self.paciente.user, self._url(self.paciente))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        resumo = response.data['summary']
        self.assertEqual(resumo['total_appointments'], 10)
        self.assertEqual(resumo['completed'], 5)
        self.assertEqual(resumo['cancelled'], 2)
        self.assertEqual(resumo['no_show'], 1)
        self.assertEqual(resumo['scheduled'], 1)
        self.assertEqual(resumo['rescheduled'], 1)

    def test_taxas_de_presenca_e_cancelamento(self):
        resumo = self._get(self.paciente.user, self._url(self.paciente)).data['summary']

        # presença = realizadas / (realizadas + faltas) = 5/6
        self.assertEqual(resumo['attendance_rate_percent'], 83.33)
        # cancelamento = canceladas / total = 2/10
        self.assertEqual(resumo['cancellation_rate_percent'], 20.0)

    def test_frequencia_mensal_separa_os_meses(self):
        meses = self._get(self.paciente.user, self._url(self.paciente)).data['frequency_by_month']

        self.assertEqual([m['month'] for m in meses], ['2026-01', '2026-02'])
        self.assertEqual(meses[0]['total'], 5)
        self.assertEqual(meses[0][S.COMPLETED], 3)
        self.assertEqual(meses[1][S.CANCELLED], 1)

    def test_filtro_de_periodo_considera_o_ultimo_dia_inteiro(self):
        # Uma consulta às 18h do último dia do período precisa entrar na conta.
        # (O teste de mutação M05 mostrou que, sem ela, cortar o último dia
        # passava despercebido.)
        Appointment.objects.create(
            patient=self.paciente, professional=self.psicologo, clinic=self.clinica,
            scheduled_at=_data(2026, 1, 31, hora=18), status=S.COMPLETED,
        )

        response = self._get(
            self.paciente.user,
            self._url(self.paciente, start_date='2026-01-01', end_date='2026-01-31'),
        )

        self.assertEqual(response.data['summary']['total_appointments'], 6)

    def test_data_em_formato_invalido_e_recusada(self):
        response = self._get(self.paciente.user, self._url(self.paciente, start_date='31/01/2026'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inicio_depois_do_fim_e_recusado(self):
        response = self._get(
            self.paciente.user,
            self._url(self.paciente, start_date='2026-03-01', end_date='2026-01-01'),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_periodo_sem_consultas_nao_divide_por_zero(self):
        resumo = self._get(
            self.paciente.user,
            self._url(self.paciente, start_date='2025-01-01', end_date='2025-01-31'),
        ).data['summary']

        self.assertEqual(resumo['total_appointments'], 0)
        self.assertEqual(resumo['attendance_rate_percent'], 0.0)

    def test_paciente_nao_ve_relatorio_de_outro_paciente(self):
        response = self._get(self.paciente.user, self._url(self.outro_paciente))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_psicologo_sem_vinculo_com_o_paciente_nao_ve_o_relatorio(self):
        response = self._get(self.outro_psicologo.user, self._url(self.paciente))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_psicologo_ve_apenas_as_proprias_consultas_do_paciente(self):
        # O Paulo também passou uma vez com o Bruno; para a Ana isso não conta.
        Appointment.objects.create(
            patient=self.paciente, professional=self.outro_psicologo, clinic=self.clinica,
            scheduled_at=_data(2026, 1, 20), status=S.COMPLETED,
        )

        ana = self._get(self.psicologo.user, self._url(self.paciente)).data['summary']
        bruno = self._get(self.outro_psicologo.user, self._url(self.paciente)).data['summary']

        self.assertEqual(ana['total_appointments'], 10)
        self.assertEqual(bruno['total_appointments'], 1)

    def test_pdf_e_gerado(self):
        response = self._get(self.paciente.user, reverse('report-patient-pdf', args=[self.paciente.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(response.streaming_content).startswith(b'%PDF'))


class RelatorioDoPsicologoTests(RelatoriosBase):

    def test_psicologo_ve_o_proprio_resumo(self):
        response = self._get(self.psicologo.user, reverse('report-professional-summary'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        resumo = response.data['summary']
        self.assertEqual(resumo['total_appointments'], 10)
        self.assertEqual(resumo['unique_patients'], 1)
        self.assertEqual(resumo['patients_attended'], 1)

    def test_psicologo_nao_ve_o_resumo_de_outro_psicologo(self):
        url = reverse('report-professional-summary') + f'?professional_id={self.outro_psicologo.id}'
        response = self._get(self.psicologo.user, url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_secretaria_precisa_informar_o_psicologo(self):
        response = self._get(self.admin, reverse('report-professional-summary'))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_paciente_nao_acessa_relatorio_de_psicologo(self):
        response = self._get(self.paciente.user, reverse('report-professional-summary'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_excel_e_um_xlsx_valido(self):
        response = self._get(self.psicologo.user, reverse('report-professional-summary-excel'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('spreadsheetml', response['Content-Type'])
        self.assertIn('.xlsx', response['Content-Disposition'])
        # .xlsx é um arquivo zip: começa com "PK".
        self.assertTrue(b''.join(response.streaming_content).startswith(b'PK'))


class RelatorioAdministrativoTests(RelatoriosBase):

    def test_secretaria_ve_os_totais_da_clinica_inteira(self):
        response = self._get(self.admin, reverse('report-admin-appointments'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['summary']['total_appointments'], 12)

    def test_quebra_por_psicologo(self):
        linhas = self._get(self.admin, reverse('report-admin-appointments')).data[
            'consultations_by_professional'
        ]

        por_nome = {linha['professional_name']: linha for linha in linhas}
        self.assertEqual(por_nome['Ana Psicologa']['total_appointments'], 10)
        self.assertEqual(por_nome['Ana Psicologa']['completed'], 5)
        self.assertEqual(por_nome['Bruno Psicologo']['total_appointments'], 2)

    def test_filtro_por_psicologo(self):
        url = reverse('report-admin-appointments') + f'?professional_id={self.outro_psicologo.id}'
        response = self._get(self.admin, url)

        self.assertEqual(response.data['summary']['total_appointments'], 2)

    def test_consultas_de_outra_clinica_nao_entram_na_conta(self):
        outra = Clinic.objects.create(name='Outra Clinica')
        psi = ProfessionalProfile.objects.create(
            user=User.objects.create_user(
                email='psi.outra@example.com', password=SENHA, full_name='X',
                role=User.Role.PROFESSIONAL, clinic=outra,
            ),
            crp='CRP-OUT',
        )
        pac = PatientProfile.objects.create(
            user=User.objects.create_user(
                email='pac.outra@example.com', password=SENHA, full_name='Y',
                role=User.Role.PATIENT, clinic=outra,
            ),
            assigned_professional=psi,
        )
        Appointment.objects.create(
            patient=pac, professional=psi, clinic=outra, scheduled_at=_data(2026, 1, 5),
        )

        response = self._get(self.admin, reverse('report-admin-appointments'))

        self.assertEqual(response.data['summary']['total_appointments'], 12)

    def test_psicologo_nao_acessa_o_relatorio_administrativo(self):
        response = self._get(self.psicologo.user, reverse('report-admin-appointments'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_exportacoes_pdf_e_excel(self):
        pdf = self._get(self.admin, reverse('report-admin-appointments-pdf'))
        excel = self._get(self.admin, reverse('report-admin-appointments-excel'))

        self.assertEqual(pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf['Content-Type'], 'application/pdf')
        self.assertEqual(excel.status_code, status.HTTP_200_OK)
        self.assertIn('spreadsheetml', excel['Content-Type'])
