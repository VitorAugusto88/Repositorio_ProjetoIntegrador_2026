from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0005_chatmessage_media_duration_ms'),
    ]

    operations = [
        migrations.AddField(
            model_name='chatmessage',
            name='media_name',
            field=models.CharField(
                blank=True,
                help_text=(
                    'Nome original do arquivo enviado. Guardado porque o storage '
                    'renomeia o arquivo (sufixo anticolisao), e o chat precisa exibir '
                    'o nome real nos anexos de documento (PDF/DOC/DOCX).'
                ),
                max_length=255,
            ),
        ),
    ]
