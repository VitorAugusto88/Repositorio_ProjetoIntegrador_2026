import uuid
from django.db import models


class Clinic(models.Model):
    """Representa uma unidade clínica. Suporta multi-clínica."""

    class ThemePreset(models.TextChoices):
        DEFAULT = 'default', 'Verde (padrão)'
        BLUE = 'blue', 'Azul'
        PURPLE = 'purple', 'Roxo'
        CUSTOM = 'custom', 'Personalizada'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    open_from = models.TimeField(default='08:00')
    open_until = models.TimeField(default='18:00')
    is_active = models.BooleanField(default=True)

    # Logo/foto da clínica — exibida no perfil e em telas com a marca da
    # clínica. Opcional: sem logo, o frontend cai num ícone padrão.
    logo = models.ImageField(upload_to='clinics/logos/', null=True, blank=True)

    # Paleta de cores da clínica: presets prontos ou cor personalizada
    # (theme_primary_color só é usado quando theme_preset='custom').
    theme_preset = models.CharField(
        max_length=10, choices=ThemePreset.choices, default=ThemePreset.DEFAULT
    )
    theme_primary_color = models.CharField(max_length=7, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Clínica'
        verbose_name_plural = 'Clínicas'
        ordering = ['name']

    def __str__(self):
        return self.name
