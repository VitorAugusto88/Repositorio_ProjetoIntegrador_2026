from django.urls import path

from . import views


urlpatterns = [
    path('', views.NotificationListView.as_view(), name='notification-list'),
    path('unread/', views.UnreadNotificationCountView.as_view(), name='notification-unread'),
    path('devices/', views.DeviceTokenView.as_view(), name='device-token-register'),
    path('devices/<str:token>/', views.DeviceTokenDeleteView.as_view(), name='device-token-delete'),
    path('<uuid:pk>/read/', views.NotificationReadView.as_view(), name='notification-read'),
]
