from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='chatmessage',
            name='content_encrypted',
            field=models.TextField(
                blank=True,
                help_text='Conteudo criptografado pelo frontend',
            ),
        ),
        migrations.AddField(
            model_name='chatmessage',
            name='attachment',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to='chat/attachments/%Y/%m/',
            ),
        ),
        migrations.AlterField(
            model_name='chatmessage',
            name='message_type',
            field=models.CharField(
                choices=[
                    ('text', 'Texto'),
                    ('image', 'Imagem'),
                    ('audio', 'Audio'),
                    ('file', 'Arquivo'),
                ],
                default='text',
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='chatmessage',
            name='media_url',
            field=models.CharField(
                blank=True,
                help_text='URL do arquivo de midia no storage',
                max_length=500,
            ),
        ),
    ]
