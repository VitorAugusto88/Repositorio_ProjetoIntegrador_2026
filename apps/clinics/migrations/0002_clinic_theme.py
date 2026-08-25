# Generated manually (backend não builda no momento por causa de um merge
# git não resolvido em outros apps — ver apps/accounts/serializers.py etc.).
# Segue o formato padrão de `manage.py makemigrations`.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinics', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='clinic',
            name='theme_preset',
            field=models.CharField(
                choices=[
                    ('default', 'Verde (padrão)'),
                    ('blue', 'Azul'),
                    ('purple', 'Roxo'),
                    ('custom', 'Personalizada'),
                ],
                default='default',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='clinic',
            name='theme_primary_color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
    ]
