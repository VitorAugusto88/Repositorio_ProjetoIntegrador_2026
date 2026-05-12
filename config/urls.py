from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth — login, refresh, logout
    path('api/auth/', include('apps.accounts.urls')),

    # Clínicas e profissionais
    path('api/clinics/', include('apps.clinics.urls')),

    # Agendamentos e disponibilidade
    path('api/appointments/', include('apps.appointments.urls')),

    # Fichas de pacientes e documentos
    path('api/records/', include('apps.records.urls')),

    # Chat entre paciente e psicólogo
    path('api/chat/', include('apps.chat.urls')),

    # Notificações
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/reports/', include('apps.reports.urls')),
]

# Serve arquivos de mídia em desenvolvimento
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
