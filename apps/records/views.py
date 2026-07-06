import mimetypes

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.audit.services import log_audit_event

from .models import Document
from .serializers import DocumentSerializer


def get_documents_for_user(user):
    if user.is_superuser:
        return Document.objects.select_related('patient__user')
    if user.is_admin:
        return Document.objects.select_related('patient__user').filter(
            patient__user__clinic_id=user.clinic_id
        )
    if user.is_professional:
        from apps.appointments.models import Appointment
        patient_ids = (
            Appointment.objects
            .filter(professional=user.professional_profile, clinic_id=user.clinic_id)
            .values_list('patient_id', flat=True)
            .distinct()
        )
        return Document.objects.select_related('patient__user').filter(
            patient_id__in=patient_ids
        )
    return Document.objects.select_related('patient__user').filter(
        patient=user.patient_profile
    )


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

        if not user.is_superuser and (user.is_admin or user.is_professional) and not user.clinic_id:
            return Document.objects.none()

        qs = get_documents_for_user(user)

        patient_id = self.request.query_params.get('patient')
        if patient_id:
            qs = qs.filter(patient__user__id=patient_id)
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        log_audit_event(
            action=AuditLog.Action.DOCUMENT_ACCESSED,
            target_model='Document',
            target_id='list',
            target_repr='Lista de documentos',
            request=request,
            metadata={
                'access_type': 'list',
                'patient_filter': request.query_params.get('patient'),
                'returned_count': self._response_count(response),
            },
        )
        return response

    def perform_create(self, serializer):
        user = self.request.user

        if user.is_patient:
            document = serializer.save(patient=user.patient_profile)
            self._log_document_created(document)
            return

        patient = serializer.validated_data.get('patient')
        if not patient:
            raise PermissionDenied('Informe o paciente do documento.')

        if not user.is_superuser and patient.user.clinic_id != user.clinic_id:
            raise PermissionDenied('Voce nao pode anexar documentos para outra clinica.')

        document = serializer.save()
        self._log_document_created(document)

    def _log_document_created(self, document):
        log_audit_event(
            action=AuditLog.Action.DOCUMENT_CREATED,
            target=document,
            request=self.request,
            metadata={
                'patient_id': str(document.patient_id),
                'file_type': document.file_type,
            },
        )

    def _response_count(self, response):
        data = response.data
        if isinstance(data, dict) and 'results' in data:
            return len(data['results'])
        if isinstance(data, list):
            return len(data)
        return None

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
        return get_documents_for_user(self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def retrieve(self, request, *args, **kwargs):
        document = self.get_object()
        serializer = self.get_serializer(document)
        log_audit_event(
            action=AuditLog.Action.DOCUMENT_ACCESSED,
            target=document,
            request=request,
            metadata={
                'access_type': 'detail',
                'patient_id': str(document.patient_id),
                'file_type': document.file_type,
            },
        )
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        user = request.user

        if not (user.is_superuser or user.is_admin or user.is_professional or document.patient == user.patient_profile):
            return Response(
                {'erro': 'Voce nao tem permissao para remover este documento.'},
                status=status.HTTP_403_FORBIDDEN
            )

        log_audit_event(
            action=AuditLog.Action.DOCUMENT_DELETED,
            target=document,
            request=request,
            metadata={
                'patient_id': str(document.patient_id),
                'file_type': document.file_type,
            },
        )

        # Remove o arquivo fisico ou remoto pelo storage configurado.
        try:
            if document.file:
                document.file.delete(save=False)
        except Exception:
            # Arquivo ja inexistente ou storage indisponivel: segue removendo o registro.
            pass

        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentDownloadView(APIView):
    """
    GET /api/records/documents/<id>/download/
    Baixa o documento passando pelo backend para gerar auditoria.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(get_documents_for_user(request.user), pk=pk)
        log_audit_event(
            action=AuditLog.Action.DOCUMENT_ACCESSED,
            target=document,
            request=request,
            metadata={
                'access_type': 'download',
                'patient_id': str(document.patient_id),
                'file_type': document.file_type,
            },
        )

        if not document.file:
            raise Http404('Arquivo nao encontrado.')

        try:
            file_handle = document.file.open('rb')
        except Exception as exc:
            raise Http404('Arquivo nao encontrado.') from exc

        filename = document.file.name.rsplit('/', 1)[-1]
        content_type, _ = mimetypes.guess_type(filename)
        return FileResponse(
            file_handle,
            as_attachment=True,
            filename=filename,
            content_type=content_type or 'application/octet-stream',
        )
