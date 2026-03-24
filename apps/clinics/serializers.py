from rest_framework import serializers
from .models import Clinic


class ClinicSerializer(serializers.ModelSerializer):
    """
    Serializer de clínicas.
    Usado para listar, criar e editar unidades clínicas.
    """
    total_professionals = serializers.SerializerMethodField()
    total_patients = serializers.SerializerMethodField()

    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'address', 'phone', 'email',
            'open_from', 'open_until', 'is_active',
            'total_professionals', 'total_patients',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_total_professionals(self, obj):
        """Conta quantos psicólogos estão vinculados à clínica."""
        return obj.users.filter(role='professional', is_active=True).count()

    def get_total_patients(self, obj):
        """Conta quantos pacientes estão vinculados à clínica."""
        return obj.users.filter(role='patient', is_active=True).count()

    def validate(self, data):
        # Garante que o horário de abertura é antes do fechamento
        if data.get('open_from') and data.get('open_until'):
            if data['open_from'] >= data['open_until']:
                raise serializers.ValidationError(
                    'O horário de abertura deve ser antes do fechamento.'
                )
        return data


class ClinicSimpleSerializer(serializers.ModelSerializer):
    """
    Versão simplificada da clínica.
    Usada dentro de outros serializers para não carregar dados demais.
    Por exemplo: quando o frontend busca um usuário, aparece
    só o nome e ID da clínica, não todos os detalhes.
    """
    class Meta:
        model = Clinic
        fields = ['id', 'name', 'address', 'phone']