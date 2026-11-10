import django.db.models.deletion
from django.db import migrations, models


def limpar_perfis_de_paciente(apps, schema_editor):
    """
    Remove os pacientes existentes antes de criar o vínculo obrigatório.

    O campo assigned_professional é NOT NULL e não tem default: não há como
    inferir com segurança qual psicólogo atende cada paciente já cadastrado,
    porque até aqui esse vínculo não existia no banco — a única pista seriam as
    consultas passadas, que erram para quem já trocou de profissional.

    A limpeza foi autorizada explicitamente: o banco é de desenvolvimento e
    seria reiniciado de qualquer forma. Em cascata saem também as consultas e os
    documentos desses pacientes.
    """
    PatientProfile = apps.get_model('accounts', 'PatientProfile')
    PatientProfile.objects.all().delete()


class Migration(migrations.Migration):

    # Sem transação única: a exclusão em cascata acima deixa eventos de trigger
    # pendentes na tabela, e o Postgres recusa o ALTER TABLE seguinte enquanto
    # eles não forem confirmados ("cannot ALTER TABLE ... because it has pending
    # trigger events"). Com atomic = False cada operação roda e confirma
    # separadamente, então a limpeza termina antes da coluna ser criada.
    atomic = False

    dependencies = [
        ('accounts', '0002_user_archived_at_user_is_archived'),
        # As duas dependências abaixo garantem que Appointment e Document já
        # existam no estado histórico, para que a exclusão em cascata acima
        # encontre e remova os registros que apontam para PatientProfile.
        ('appointments', '0003_appointment_completed_at'),
        ('records', '0002_document_clinic_alter_document_patient'),
    ]

    operations = [
        migrations.RunPython(
            limpar_perfis_de_paciente,
            # Sem reversão possível: os dados apagados não voltam. A migração
            # reversa apenas remove a coluna (operação seguinte).
            migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name='patientprofile',
            name='assigned_professional',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='assigned_patients',
                to='accounts.professionalprofile',
                verbose_name='Psicólogo responsável',
            ),
        ),
    ]
