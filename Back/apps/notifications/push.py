"""
Envio de push via Expo Push Service (https://docs.expo.dev/push-notifications/).

Nao usa firebase-admin: basta um POST HTTP para o endpoint do Expo com os
ExpoPushToken. O Expo repassa para FCM (Android) e APNs (iOS).
"""
import logging

import requests

from django.conf import settings

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
EXPO_PUSH_TIMEOUT = 10


def send_expo_push(messages):
    """
    Envia uma lista de mensagens ao Expo Push Service.

    Cada mensagem: {'to', 'title', 'body', 'data', 'sound'}.
    Retorna a lista de "tickets" (um por mensagem, na mesma ordem). Em caso de
    falha de rede/HTTP retorna [] — nunca levanta excecao, para nao derrubar o
    fluxo que originou a notificacao (ex.: envio de mensagem de chat).
    """
    if not messages:
        return []

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    access_token = getattr(settings, 'EXPO_ACCESS_TOKEN', '')
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'

    try:
        response = requests.post(
            EXPO_PUSH_URL,
            json=messages,
            headers=headers,
            timeout=EXPO_PUSH_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        logger.exception('Falha ao chamar o Expo Push Service')
        return []

    tickets = payload.get('data')
    if isinstance(tickets, dict):  # resposta de uma unica mensagem
        tickets = [tickets]
    return tickets or []
