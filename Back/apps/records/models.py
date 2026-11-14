import uuid
from django.db import models


class Document(models.Model):
    """Documentos enviados pelo paciente (PDFs, exames, etc.)."""

    class FileType(models.TextChoices):
        PDF = 'pdf', 'PDF'
        IMAGE = 'image', 'Imagem'
        OTHER = 'other', 'Outro'

    class Area(models.TextChoices):
        # Clinico: enviado pelo psicologo (ou pelo paciente) — so o psicologo
        # da clinica ve. Administrativo: enviado pela secretaria/admin
        # (contratos, comprovantes...), com ou sem paciente — so o admin ve.
        # As duas areas nunca se misturam.
        CLINICAL = 'clinical', 'Clínico'
        ADMINISTRATIVE = 'administrative', 'Administrativo'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Paciente é opcional: um documento pode ser "avulso" (sem vínculo).
    patient = models.ForeignKey(
        'accounts.PatientProfile',
        on_delete=models.CASCADE,
        related_name='documents',
        null=True, blank=True,
    )
    # Clínica dona do documento — usada para escopar os avulsos (que não têm
    # paciente para inferir a clínica) no ambiente multi-tenant.
    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.CASCADE,
        related_name='documents',
        null=True, blank=True,
    )
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to='documents/%Y/%m/')
    file_type = models.CharField(max_length=10, choices=FileType.choices, default=FileType.PDF)
    area = models.CharField(
        max_length=20, choices=Area.choices, default=Area.CLINICAL, db_index=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Documento'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.title} — {self.patient or "avulso"}'
