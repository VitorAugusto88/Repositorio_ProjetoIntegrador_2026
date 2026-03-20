import uuid
from django.db import models


class Clinic(models.Model):
    """Representa uma unidade clínica. Suporta multi-clínica."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    open_from = models.TimeField(default='08:00')
    open_until = models.TimeField(default='18:00')
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Clínica'
        verbose_name_plural = 'Clínicas'
        ordering = ['name']

    def __str__(self):
        return self.name
