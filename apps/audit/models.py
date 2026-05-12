import uuid

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        PATIENT_CREATED = 'patient.created', 'Paciente criado'
        PATIENT_UPDATED = 'patient.updated', 'Paciente editado'
        PATIENT_ANAMNESIS_UPDATED = (
            'patient.anamnesis_updated',
            'Anamnese editada',
        )
        APPOINTMENT_CREATED = 'appointment.created', 'Consulta criada'
        APPOINTMENT_UPDATED = 'appointment.updated', 'Consulta editada'
        APPOINTMENT_CANCELLED = 'appointment.cancelled', 'Consulta cancelada'
        DOCUMENT_CREATED = 'document.created', 'Documento criado'
        DOCUMENT_ACCESSED = 'document.accessed', 'Documento acessado'
        DOCUMENT_DELETED = 'document.deleted', 'Documento removido'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    actor_email = models.EmailField(blank=True)
    actor_role = models.CharField(max_length=30, blank=True)
    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=80, choices=Action.choices)
    target_model = models.CharField(max_length=120)
    target_id = models.CharField(max_length=80)
    target_repr = models.CharField(max_length=255, blank=True)
    request_method = models.CharField(max_length=10, blank=True)
    request_path = models.CharField(max_length=500, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Log de auditoria'
        verbose_name_plural = 'Logs de auditoria'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['clinic', '-created_at']),
            models.Index(fields=['actor', '-created_at']),
            models.Index(fields=['action', '-created_at']),
            models.Index(fields=['target_model', 'target_id']),
        ]

    def __str__(self):
        return f'{self.action} por {self.actor_email or "sistema"}'
