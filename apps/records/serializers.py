# Serializers da Fase 2
from rest_framework import serializers
from .models import Document
from apps.accounts.models import PatientProfile


class DocumentSerializer(serializers.ModelSerializer):
    """
    Serializer de documentos do paciente.
    Cuida do upload de PDFs, imagens e outros arquivos.
    """
    file_url = serializers.SerializerMethodField()
    file_type_display = serializers.CharField(source='get_file_type_display', read_only=True)
    patient = serializers.PrimaryKeyRelatedField(
        queryset=PatientProfile.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Document
        fields = [
            'id', 'patient', 'title', 'file', 'file_url',
            'file_type', 'file_type_display', 'uploaded_at'
        ]
        read_only_fields = ['id', 'uploaded_at', 'file_url']

    def get_file_url(self, obj):
        """
        Retorna a URL completa do arquivo para o frontend baixar.
        Ex: http://localhost:8000/media/documents/2024/01/exame.pdf
        """
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

import os
import magic

ALLOWED_MIMES = {
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

def validate_file(self, value):
    limite = 10 * 1024 * 1024
    if value.size > limite:
        raise serializers.ValidationError('O arquivo não pode ser maior que 10MB.')

    ext = os.path.splitext(value.name)[1].lower()
    if ext not in ALLOWED_MIMES:
        raise serializers.ValidationError(
            f'Extensão não permitida. Use: {", ".join(ALLOWED_MIMES.keys())}'
        )

    mime = magic.from_buffer(value.read(2048), mime=True)
    value.seek(0)
    if mime != ALLOWED_MIMES[ext]:
        raise serializers.ValidationError(
            'O conteúdo do arquivo não corresponde à extensão informada.'
        )

    return value