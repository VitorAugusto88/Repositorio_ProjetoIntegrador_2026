# Serializers da Fase 2
from rest_framework import serializers
from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    """
    Serializer de documentos do paciente.
    Cuida do upload de PDFs, imagens e outros arquivos.
    """
    file_url = serializers.SerializerMethodField()
    file_type_display = serializers.CharField(source='get_file_type_display', read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'patient', 'title', 'file', 'file_url',
            'file_type', 'file_type_display', 'uploaded_at'
        ]
        read_only_fields = ['id', 'patient', 'uploaded_at', 'file_url']

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
        # Limite de 10MB por arquivo
        limite = 10 * 1024 * 1024
        if value.size > limite:
            raise serializers.ValidationError(
                'O arquivo não pode ser maior que 10MB.'
            )

        # Extensões permitidas
        extensoes = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']
        import os
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in extensoes:
            raise serializers.ValidationError(
                f'Tipo de arquivo não permitido. Use: {", ".join(extensoes)}'
            )
        return value