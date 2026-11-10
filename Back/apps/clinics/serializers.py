import re

from rest_framework import serializers
from apps.uploads import replace_file_field, validate_no_replace_and_remove, validate_size
from .models import Clinic, Room

HEX_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')
MAX_LOGO_SIZE = 5 * 1024 * 1024


class ClinicSerializer(serializers.ModelSerializer):
    """
    Serializer de clínicas.
    Usado para listar, criar e editar unidades clínicas.
    """
    total_professionals = serializers.SerializerMethodField()
    total_patients = serializers.SerializerMethodField()
    logo = serializers.ImageField(required=False, allow_null=True)
    # Flag write-only para remover a logo atual via multipart (um campo de
    # arquivo vazio não é interpretado como "limpar" pelo DRF).
    remove_logo = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = Clinic
        fields = [
            'id', 'name', 'address', 'phone', 'email',
            'open_from', 'open_until', 'is_active',
            'theme_preset', 'theme_primary_color', 'logo', 'remove_logo',
            'total_professionals', 'total_patients',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_logo(self, value):
        validate_size(value, MAX_LOGO_SIZE, 'A logo não pode ser maior que 5MB.')
        return value

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

        # Resolve preset/cor considerando o valor já salvo na instância (PATCH parcial)
        preset = data.get('theme_preset', getattr(self.instance, 'theme_preset', Clinic.ThemePreset.DEFAULT))
        color = data.get('theme_primary_color', getattr(self.instance, 'theme_primary_color', ''))

        if color and not HEX_COLOR_RE.match(color):
            raise serializers.ValidationError(
                {'theme_primary_color': 'A cor deve estar no formato hexadecimal #RRGGBB.'}
            )

        if preset == Clinic.ThemePreset.CUSTOM and not color:
            raise serializers.ValidationError(
                {'theme_primary_color': 'Informe uma cor para a paleta personalizada.'}
            )

        validate_no_replace_and_remove(data, 'logo', 'remove_logo')

        return data

    def update(self, instance, validated_data):
        validated_data = replace_file_field(instance, 'logo', validated_data, 'remove_logo')
        return super().update(instance, validated_data)


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


class RoomSerializer(serializers.ModelSerializer):
    """
    Sala da clinica.

    `status` e DERIVADO: 'livre'/'ocupada' calculado a partir das consultas em
    aberto do intervalo pedido. Nao existe coluna de status no banco — a view
    injeta `occupied_room_ids` no contexto e aqui so consultamos esse conjunto.
    Sem contexto de intervalo (ex.: resposta de POST/PATCH), o campo e omitido.
    """
    status = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            'id', 'clinic', 'name', 'description', 'is_active', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'clinic', 'created_at', 'updated_at']

    def get_status(self, obj):
        occupied = self.context.get('occupied_room_ids')
        if occupied is None:
            return None
        return Room.STATUS_BUSY if obj.id in occupied else Room.STATUS_FREE