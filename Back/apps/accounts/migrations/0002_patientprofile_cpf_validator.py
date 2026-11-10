from django.db import migrations, models
import apps.accounts.models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='patientprofile',
            name='cpf',
            field=models.CharField(
                blank=True,
                max_length=14,
                null=True,
                unique=True,
                validators=[apps.accounts.models.validate_cpf],
            ),
        ),
    ]
