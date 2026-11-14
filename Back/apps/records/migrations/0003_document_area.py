from django.db import migrations, models


def classificar_documentos_existentes(apps, schema_editor):
    """
    Ate aqui o admin so conseguia enviar documentos avulsos (sem paciente) e o
    psicologo so enviava documentos vinculados a paciente. Entao: avulso =
    administrativo; vinculado a paciente = clinico.
    """
    Document = apps.get_model('records', 'Document')
    Document.objects.filter(patient__isnull=True).update(area='administrative')
    Document.objects.filter(patient__isnull=False).update(area='clinical')


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0002_document_clinic_alter_document_patient'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='area',
            field=models.CharField(
                choices=[('clinical', 'Clínico'), ('administrative', 'Administrativo')],
                db_index=True, default='clinical', max_length=20,
            ),
        ),
        migrations.RunPython(classificar_documentos_existentes, migrations.RunPython.noop),
    ]
