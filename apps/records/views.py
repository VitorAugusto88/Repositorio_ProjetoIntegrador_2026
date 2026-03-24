# Views da Fase 2
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from .models import Document
from .serializers import DocumentSerializer
from apps.accounts.permissions import IsProfessionalOrAdmin


class DocumentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/records/documents/?patient=<id>
    Lista os documentos de um paciente.
    Paciente vê só os seus. Psicólogo e admin veem de qualquer paciente.

    POST /api/records/documents/
    Faz upload de um novo documento.
    Aceita multipart/form-data (arquivo + campos).
    """
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    # MultiPartParser e FormParser são necessários para aceitar upload de arquivos
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user

        if user.is_admin or user.is_professional:
            # Psicólogo e admin podem filtrar por paciente
            patient_id = self.request.query_params.get('patient')
            qs = Document.objects.all()
            if patient_id:
                qs = qs.filter(patient__user__id=patient_id)
            return qs

        # Paciente vê só os próprios documentos
        return Document.objects.filter(patient=user.patient_profile)

    def perform_create(self, serializer):
        # Paciente faz upload para si mesmo
        if self.request.user.is_patient:
            serializer.save(patient=self.request.user.patient_profile)
        else:
            serializer.save()

    def get_serializer_context(self):
        # Passa o request para o serializer conseguir montar a URL do arquivo
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/records/documents/<id>/
    Detalhes de um documento específico com URL para download.

    DELETE /api/records/documents/<id>/
    Remove o documento. Só o próprio paciente ou admin pode deletar.
    """
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin or user.is_professional:
            return Document.objects.all()
        return Document.objects.filter(patient=user.patient_profile)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        user = request.user

        # Só o próprio paciente ou admin pode deletar
        if not (user.is_admin or document.patient == user.patient_profile):
            return Response(
                {'erro': 'Você não tem permissão para remover este documento.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Remove o arquivo físico do disco também
        if document.file:
            import os
            if os.path.isfile(document.file.path):
                os.remove(document.file.path)

        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)