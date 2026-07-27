from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeviceToken, Notification
from .serializers import DeviceTokenSerializer, NotificationSerializer


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

    def delete(self, request, *args, **kwargs):
        """
        DELETE /api/notifications/
        Apaga todas as notificacoes in-app do usuario logado.
        """
        deleted, _ = self.get_queryset().delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)


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


class DeviceTokenView(APIView):
    """
    POST /api/notifications/devices/
    Registra (ou reativa) o token de push do aparelho para o usuario logado.
    Corpo: { "token": "ExponentPushToken[...]", "platform": "android|ios|web" }.
    Upsert por token: o mesmo token nunca duplica e e reatribuido ao usuario atual.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeviceTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device, _ = DeviceToken.objects.update_or_create(
            token=serializer.validated_data['token'],
            defaults={
                'user': request.user,
                'platform': serializer.validated_data['platform'],
                'is_active': True,
                'last_used_at': timezone.now(),
            },
        )
        return Response(
            DeviceTokenSerializer(device).data,
            status=status.HTTP_200_OK,
        )


class DeviceTokenDeleteView(APIView):
    """
    DELETE /api/notifications/devices/<token>/
    Desativa o token do aparelho (chamado no logout).
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, token):
        updated = DeviceToken.objects.filter(
            token=token,
            user=request.user,
        ).update(is_active=False)
        if not updated:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
