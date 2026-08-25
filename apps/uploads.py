"""
Regras compartilhadas de validacao de arquivos enviados (documentos do
prontuario e anexos do chat), para que os dois modulos aceitem exatamente
os mesmos tipos e apliquem a mesma checagem de conteudo.

A verificacao de conteudo compara a **assinatura** (bytes iniciais) do arquivo
com a extensao informada. Nao usamos o libmagic/python-magic porque ele depende
de arquivos de magia do sistema — no venv Windows de desenvolvimento ele falha
com "could not find any valid magic files", o que deixaria a validacao
silenciosamente inativa justamente onde ela e testada.
"""

from pathlib import Path

from rest_framework import serializers

# Tipos aceitos como documento — a mesma lista vale para o prontuario e para
# os anexos de documento do chat.
DOCUMENT_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'}

# Assinaturas conhecidas por extensao. Um arquivo so passa se comecar com uma
# das assinaturas da sua extensao — renomear um .exe para .pdf nao basta.
FILE_SIGNATURES = {
    '.pdf': (b'%PDF',),
    '.png': (b'\x89PNG\r\n\x1a\n',),
    '.jpg': (b'\xff\xd8\xff',),
    '.jpeg': (b'\xff\xd8\xff',),
    '.doc': (
        b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',  # container OLE2 do Word 97-2003
    ),
    '.docx': (
        b'PK\x03\x04',  # docx e um zip
        b'PK\x05\x06',
        b'PK\x07\x08',
    ),
}


def get_extension(uploaded_file):
    return Path(uploaded_file.name).suffix.lower()


def validate_size(uploaded_file, max_bytes, mensagem=None):
    if uploaded_file.size > max_bytes:
        megabytes = max_bytes // (1024 * 1024)
        raise serializers.ValidationError(
            mensagem or f'O arquivo não pode ser maior que {megabytes}MB.'
        )


def validate_signature(uploaded_file, extension):
    """
    Confere se o conteudo bate com a extensao informada. Extensoes sem
    assinatura conhecida (audio do chat, por exemplo) passam direto — a lista
    de extensoes permitidas continua sendo a barreira principal.
    """
    signatures = FILE_SIGNATURES.get(extension)
    if not signatures:
        return

    header = uploaded_file.read(max(len(signature) for signature in signatures))
    uploaded_file.seek(0)

    if not any(header.startswith(signature) for signature in signatures):
        raise serializers.ValidationError(
            'O conteúdo do arquivo não corresponde à extensão informada.'
        )


def validate_no_replace_and_remove(attrs, field_name, remove_flag_name):
    """
    Usado no validate() de serializers com um campo de arquivo substituível
    (logo da clínica, foto de perfil) + uma flag write-only `remove_<campo>`
    para limpar via multipart. Barra o caso ambíguo de mandar os dois juntos.
    """
    if attrs.get(remove_flag_name) and attrs.get(field_name):
        raise serializers.ValidationError(
            {field_name: 'Envie um arquivo novo ou remova o atual, não os dois.'}
        )


def replace_file_field(instance, field_name, validated_data, remove_flag_name):
    """
    Usado no update() do mesmo tipo de serializer acima: apaga o arquivo
    antigo do storage ao trocar ou remover, e resolve a flag `remove_<campo>`
    em None no campo real — um campo de arquivo vazio no multipart não é
    interpretado como "remover" pelo DRF.
    """
    remove = validated_data.pop(remove_flag_name, False)
    new_value = validated_data.get(field_name)

    if remove or new_value:
        old_value = getattr(instance, field_name)
        if old_value:
            old_value.delete(save=False)
        if remove:
            validated_data[field_name] = None

    return validated_data
