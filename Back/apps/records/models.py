import uuid
from django.db import models


class Document(models.Model):
    """Documentos enviados pelo paciente (PDFs, exames, etc.)."""

    class FileType(models.TextChoices):
        PDF = 'pdf', 'PDF'
        IMAGE = 'image', 'Imagem'
        OTHER = 'other', 'Outro'

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
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Documento'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.title} — {self.patient or "avulso"}'
