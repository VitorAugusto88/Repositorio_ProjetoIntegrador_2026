import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email é obrigatório')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', User.Role.ADMIN)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Modelo central de usuário.
    Um único User pode ser paciente, psicólogo ou admin —
    diferenciado pelo campo role.
    """

    class Role(models.TextChoices):
        PATIENT = 'patient', 'Paciente'
        PROFESSIONAL = 'professional', 'Psicólogo'
        ADMIN = 'admin', 'Administrador'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey(
        'clinics.Clinic',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='users'
    )

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PATIENT)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        verbose_name = 'Usuário'
        verbose_name_plural = 'Usuários'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.full_name} ({self.role})'

    @property
    def is_patient(self):
        return self.role == self.Role.PATIENT

    @property
    def is_professional(self):
        return self.role == self.Role.PROFESSIONAL

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN


class PatientProfile(models.Model):
    """Dados extras exclusivos de pacientes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='patient_profile')

    birth_date = models.DateField(null=True, blank=True)
    cpf = models.CharField(max_length=14, unique=True, null=True, blank=True)
    medical_history = models.TextField(blank=True, help_text='Histórico médico básico')
    anamnesis = models.TextField(blank=True, help_text='Anamnese inicial — editável pelo profissional')
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Perfil do paciente'

    def __str__(self):
        return f'Perfil de {self.user.full_name}'


class ProfessionalProfile(models.Model):
    """Dados extras exclusivos de psicólogos."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='professional_profile')

    crp = models.CharField(max_length=20, unique=True, help_text='Número do CRP')
    specialty = models.CharField(max_length=100, blank=True)
    bio = models.TextField(blank=True)
    photo = models.ImageField(upload_to='professionals/photos/', null=True, blank=True)
    session_duration_minutes = models.PositiveIntegerField(
        default=50,
        help_text='Duração padrão da sessão em minutos'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Perfil do profissional'

    def __str__(self):
        return f'Dr(a). {self.user.full_name} — CRP {self.crp}'
