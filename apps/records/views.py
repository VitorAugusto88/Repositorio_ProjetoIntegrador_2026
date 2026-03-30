from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import PermissionDenied

from .models import Document
from .serializers import DocumentSerializer


class DocumentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/records/documents/?patient=<id>
    Lista os documentos do usuario logado ou da propria clinica.

    POST /api/records/documents/
    Faz upload de um novo documento.
    """
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            qs = Document.objects.all()
        elif user.is_admin or user.is_professional:
            if not user.clinic_id:
                return Document.objects.none()
            qs = Document.objects.filter(patient__user__clinic_id=user.clinic_id)
        else:
            return Document.objects.filter(patient=user.patient_profile)

        patient_id = self.request.query_params.get('patient')
        if patient_id:
            qs = qs.filter(patient__user__id=patient_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user

        if user.is_patient:
            serializer.save(patient=user.patient_profile)
            return

        patient = serializer.validated_data.get('patient')
        if not patient:
            raise PermissionDenied('Informe o paciente do documento.')

        if not user.is_superuser and patient.user.clinic_id != user.clinic_id:
            raise PermissionDenied('Voce nao pode anexar documentos para outra clinica.')

        serializer.save()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/records/documents/<id>/
    DELETE /api/records/documents/<id>/
    """
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Document.objects.all()
        if user.is_admin or user.is_professional:
            return Document.objects.filter(patient__user__clinic_id=user.clinic_id)
        return Document.objects.filter(patient=user.patient_profile)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        user = request.user

        if not (user.is_superuser or user.is_admin or document.patient == user.patient_profile):
            return Response(
                {'erro': 'Voce nao tem permissao para remover este documento.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if document.file:
            import os
            if os.path.isfile(document.file.path):
                os.remove(document.file.path)

        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
