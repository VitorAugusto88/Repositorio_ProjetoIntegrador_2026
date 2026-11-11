from rest_framework import serializers
from .models import Document
from apps.accounts.models import PatientProfile
from apps.uploads import (
    DOCUMENT_EXTENSIONS,
    get_extension,
    validate_signature,
    validate_size,
)

MAX_DOCUMENT_SIZE = 10 * 1024 * 1024


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
    # Campos de exibição para o módulo de documentos do admin.
    patient_name = serializers.SerializerMethodField()
    patient_archived = serializers.SerializerMethodField()
    is_avulso = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'patient', 'patient_name', 'patient_archived', 'is_avulso',
            'title', 'file', 'file_url',
            'file_type', 'file_type_display', 'uploaded_at'
        ]
        read_only_fields = [
            'id', 'uploaded_at', 'file_url',
            'patient_name', 'patient_archived', 'is_avulso',
        ]

    def get_patient_name(self, obj):
        if obj.patient_id and obj.patient and obj.patient.user:
            return obj.patient.user.full_name
        return None

    def get_patient_archived(self, obj):
        return bool(obj.patient_id and obj.patient and obj.patient.user
                    and obj.patient.user.is_archived)

    def get_is_avulso(self, obj):
        return obj.patient_id is None

    def get_file_url(self, obj):
        """
        Retorna a URL completa do arquivo para o frontend baixar.
        Ex: http://localhost:8000/media/documents/2024/01/exame.pdf
        """
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

    def validate_file(self, value):
        """
        Tamanho, extensão e conteúdo do arquivo enviado.

        Precisa ser método da classe: enquanto isto era uma função solta no
        módulo, o DRF nunca a chamava e o upload aceitava qualquer arquivo.
        """
        validate_size(value, MAX_DOCUMENT_SIZE)

        extension = get_extension(value)
        if extension not in DOCUMENT_EXTENSIONS:
            permitidas = ', '.join(sorted(DOCUMENT_EXTENSIONS))
            raise serializers.ValidationError(
                f'Extensão não permitida. Use: {permitidas}'
            )

        validate_signature(value, extension)
        return value