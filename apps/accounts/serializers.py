from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, PatientProfile, ProfessionalProfile


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
        read_only_fields = ['id', 'created_at']


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer de cadastro — paciente se registra por aqui."""
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'password', 'full_name', 'phone', 'role', 'clinic']

    def validate_role(self, value):
        # Registro público só pode criar pacientes
        # Admin cria psicólogos pelo painel
        if value not in [User.Role.PATIENT]:
            raise serializers.ValidationError('Auto-cadastro permitido apenas para pacientes.')
        return value

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        # Cria perfil de paciente automaticamente
        PatientProfile.objects.create(user=user)
        return user


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
    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'is_active', 'created_at']
        read_only_fields = fields
