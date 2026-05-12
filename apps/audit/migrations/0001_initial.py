import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('clinics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                (
                    'id',
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ('actor_email', models.EmailField(blank=True, max_length=254)),
                ('actor_role', models.CharField(blank=True, max_length=30)),
                (
                    'action',
                    models.CharField(
                        choices=[
                            ('patient.created', 'Paciente criado'),
                            ('patient.updated', 'Paciente editado'),
                            (
                                'patient.anamnesis_updated',
                                'Anamnese editada',
                            ),
                            ('appointment.created', 'Consulta criada'),
                            ('appointment.updated', 'Consulta editada'),
                            ('appointment.cancelled', 'Consulta cancelada'),
                            ('document.created', 'Documento criado'),
                            ('document.accessed', 'Documento acessado'),
                            ('document.deleted', 'Documento removido'),
                        ],
                        max_length=80,
                    ),
                ),
                ('target_model', models.CharField(max_length=120)),
                ('target_id', models.CharField(max_length=80)),
                ('target_repr', models.CharField(blank=True, max_length=255)),
                ('request_method', models.CharField(blank=True, max_length=10)),
                ('request_path', models.CharField(blank=True, max_length=500)),
                (
                    'ip_address',
                    models.GenericIPAddressField(blank=True, null=True),
                ),
                ('user_agent', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'actor',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='audit_logs',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'clinic',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='audit_logs',
                        to='clinics.clinic',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Log de auditoria',
                'verbose_name_plural': 'Logs de auditoria',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(
                fields=['clinic', '-created_at'],
                name='audit_audit_clinic__d4f65a_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(
                fields=['actor', '-created_at'],
                name='audit_audit_actor_i_1175ab_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(
                fields=['action', '-created_at'],
                name='audit_audit_action_0c6a84_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(
                fields=['target_model', 'target_id'],
                name='audit_audit_target__573821_idx',
            ),
        ),
    ]
