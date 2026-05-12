from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    Lista notificacoes do usuario logado.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user,
            channel=Notification.Channel.IN_APP,
        )


class UnreadNotificationCountView(APIView):
    """
    GET /api/notifications/unread/
    Conta notificacoes nao lidas do usuario logado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user,
            channel=Notification.Channel.IN_APP,
            is_read=False,
        ).count()
        return Response({'unread_count': count})


class NotificationReadView(APIView):
    """
    PATCH /api/notifications/<uuid>/read/
    Marca uma notificacao do usuario logado como lida.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        notification = generics.get_object_or_404(
            Notification,
            pk=pk,
            user=request.user,
            channel=Notification.Channel.IN_APP,
        )
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=['is_read', 'read_at'])

        serializer = NotificationSerializer(notification)
        return Response(serializer.data)
