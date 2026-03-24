from django.urls import path
from . import views

urlpatterns = [
    path('', views.ClinicListView.as_view(), name='clinic-list'),
    path('create/', views.ClinicCreateView.as_view(), name='clinic-create'),
    path('<uuid:pk>/', views.ClinicDetailView.as_view(), name='clinic-detail'),
    path('<uuid:pk>/professionals/', views.ClinicProfessionalsView.as_view(), name='clinic-professionals'),
    path('<uuid:pk>/stats/', views.ClinicStatsView.as_view(), name='clinic-stats'),
]

#GET    /api/clinics/
##POST   /api/clinics/create/
#GET    /api/clinics/<id>/
#PATCH  /api/clinics/<id>/
#GET    /api/clinics/<id>/professionals/
#GET    /api/clinics/<id>/stats/