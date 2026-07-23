from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, PatientProfile, ProfessionalProfile
from apps.notifications.utils import send_invitation_email, send_password_reset_email


class CustomTokenObtainSerializer(TokenObtainPairSerializer):
    """
    Adiciona role e clinic_id ao payload do JWT.
    O frontend usa isso para saber qual interface mostrar
    sem precisar fazer uma requisição extra.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['full_name'] = user.full_name
        token['clinic_id'] = str(user.clinic_id) if user.clinic_id else None
        return token


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'role', 'clinic', 'is_active', 'created_at']
        read_only_fields = ['id', 'email', 'role', 'clinic', 'is_active', 'created_at']


class PatientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = PatientProfile
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class ProfessionalProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ProfessionalProfile
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class PatientListSerializer(serializers.ModelSerializer):
    """
    Retorna PatientProfile com user aninhado.
    O campo 'id' e o PatientProfile.id — usado no POST /api/appointments/ como 'patient'.
    """
    user = UserSerializer(read_only=True)

    class Meta:
        model = PatientProfile
        fields = ['id', 'user', 'birth_date', 'cpf', 'created_at']
        read_only_fields = fields


def ensure_role_profile(user, profile_data=None):
    profile_data = profile_data or {}

    if user.is_patient:
        PatientProfile.objects.get_or_create(user=user, defaults=profile_data)
        return

    if user.is_professional:
        ProfessionalProfile.objects.get_or_create(user=user, defaults=profile_data)


class AdminUserSerializer(serializers.ModelSerializer):
    patient_profile = PatientProfileSerializer(read_only=True)
    professional_profile = ProfessionalProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role', 'clinic',
            'is_active', 'created_at', 'updated_at',
            'patient_profile', 'professional_profile',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AdminUserCreateSerializer(serializers.ModelSerializer):
    crp = serializers.CharField(required=False, allow_blank=True, write_only=True)
    specialty = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bio = serializers.CharField(required=False, allow_blank=True, write_only=True)
    session_duration_minutes = serializers.IntegerField(required=False, write_only=True)
    photo = serializers.ImageField(required=False, allow_null=True, write_only=True)
    birth_date = serializers.DateField(required=False, allow_null=True, write_only=True)
    cpf = serializers.CharField(required=False, allow_blank=True, write_only=True)
    medical_history = serializers.CharField(required=False, allow_blank=True, write_only=True)
    anamnesis = serializers.CharField(required=False, allow_blank=True, write_only=True)
    emergency_contact_name = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    emergency_contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    send_invite = serializers.BooleanField(default=True, write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role', 'clinic',
            'crp', 'specialty', 'bio', 'session_duration_minutes', 'photo',
            'birth_date', 'cpf', 'medical_history', 'anamnesis',
            'emergency_contact_name', 'emergency_contact_phone',
            'send_invite',
        ]
        read_only_fields = ['id']

    def validate_role(self, value):
        if value not in [User.Role.PATIENT, User.Role.PROFESSIONAL]:
            raise serializers.ValidationError(
                'A criacao interna permite apenas pacientes ou profissionais.'
            )
        return value

    def validate(self, attrs):
        request = self.context['request']
        creator = request.user
        role = attrs.get('role')

        if not creator.is_superuser:
            attrs['clinic'] = creator.clinic
        elif not attrs.get('clinic'):
            raise serializers.ValidationError(
                {'clinic': 'Superusers devem informar a clinica do usuario.'}
            )

        if role == User.Role.PROFESSIONAL and not attrs.get('crp'):
            raise serializers.ValidationError({'crp': 'CRP e obrigatorio.'})

        return attrs

    def create(self, validated_data):
        send_invite = validated_data.pop('send_invite', True)
        role = validated_data.get('role')
        profile_data = self._pop_profile_data(validated_data, role)
        user = User.objects.create_user(password=None, **validated_data)
        user.set_unusable_password()
        user.save(update_fields=['password'])
        ensure_role_profile(user, profile_data)

        if send_invite:
            send_invitation_email(user)

        return user

    def _pop_profile_data(self, data, role):
        patient_fields = [
            'birth_date', 'cpf', 'medical_history', 'anamnesis',
            'emergency_contact_name', 'emergency_contact_phone',
        ]
        professional_fields = [
            'crp', 'specialty', 'bio', 'session_duration_minutes', 'photo',
        ]
        profile_data = {}
        allowed_fields = patient_fields if role == User.Role.PATIENT else professional_fields

        for field in patient_fields + professional_fields:
            if field not in data:
                continue
            value = data.pop(field)
            if field in allowed_fields:
                profile_data[field] = value

        return profile_data


class AdminPatientCreateSerializer(AdminUserCreateSerializer):
    def validate(self, attrs):
        attrs['role'] = User.Role.PATIENT
        return super().validate(attrs)


class AdminProfessionalCreateSerializer(AdminUserCreateSerializer):
    def validate(self, attrs):
        attrs['role'] = User.Role.PROFESSIONAL
        return super().validate(attrs)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'phone', 'email']


class AdminUserRoleSerializer(serializers.ModelSerializer):
    crp = serializers.CharField(required=False, allow_blank=True, write_only=True)
    specialty = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bio = serializers.CharField(required=False, allow_blank=True, write_only=True)
    session_duration_minutes = serializers.IntegerField(required=False, write_only=True)

    class Meta:
        model = User
        fields = ['role', 'crp', 'specialty', 'bio', 'session_duration_minutes']

    def validate_role(self, value):
        if value not in [User.Role.PATIENT, User.Role.PROFESSIONAL, User.Role.ADMIN]:
            raise serializers.ValidationError('Role invalida.')
        return value

    def validate(self, attrs):
        instance = self.instance
        role = attrs.get('role')

        if (
            role == User.Role.PROFESSIONAL
            and not hasattr(instance, 'professional_profile')
            and not attrs.get('crp')
        ):
            raise serializers.ValidationError(
                {'crp': 'CRP e obrigatorio para criar o perfil profissional.'}
            )

        return attrs

    def update(self, instance, validated_data):
        profile_data = {
            field: validated_data.pop(field)
            for field in ['crp', 'specialty', 'bio', 'session_duration_minutes']
            if field in validated_data
        }
        instance = super().update(instance, validated_data)
        ensure_role_profile(instance, profile_data)
        return instance


class AdminUserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()

    def update(self, instance, validated_data):
        instance.is_active = validated_data['is_active']
        instance.save(update_fields=['is_active'])
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self):
        email = self.validated_data['email']
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user:
            send_password_reset_email(user)


class PasswordSetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    default_error_messages = {
        'invalid_token': 'Token invalido ou expirado.',
    }

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=uid, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            self.fail('invalid_token')

        if not default_token_generator.check_token(user, attrs['token']):
            self.fail('invalid_token')

        validate_password(attrs['password'], user)
        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """
    Troca de senha do usuario autenticado: confere a senha atual e aplica a
    nova. Sem e-mail (o fluxo por e-mail e so para quem NAO consegue logar).
    """
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    default_error_messages = {
        'wrong_password': 'Senha atual incorreta.',
    }

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            self.fail('wrong_password')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context['request'].user)
        return value

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
