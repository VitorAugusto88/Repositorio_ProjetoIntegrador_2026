from django.urls import path
from . import views

urlpatterns = [
    path("documents/", views.DocumentListCreateView.as_view(), name="document-list"),
    path(
        "documents/<uuid:pk>/download/",
        views.DocumentDownloadView.as_view(),
        name="document-download",
    ),
    path(
        "documents/<uuid:pk>/",
        views.DocumentDetailView.as_view(),
        name="document-detail",
    ),
]

# GET /api/records/documents/ → lista documentos
# POST /api/records/documents/ → faz upload de arquivo
# GET /api/records/documents/<id>/ → detalhes e URL para download
# DELETE /api/records/documents/<id>/ → remove o documento
