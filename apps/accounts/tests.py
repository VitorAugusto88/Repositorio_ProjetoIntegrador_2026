from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User


class ChangePasswordTests(APITestCase):
    def setUp(self):
        self.url = reverse('password-change')
        self.current_password = 'SenhaAtual123'
        self.user = User.objects.create_user(
            email='paciente@example.com',
            password=self.current_password,
            full_name='Paciente Teste',
            role=User.Role.PATIENT,
        )
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NovaSenhaForte456'))
        self.assertFalse(self.user.check_password(self.current_password))

    def test_wrong_current_password_is_rejected(self):
        response = self.client.post(
            self.url,
            {
                'current_password': 'SenhaErrada000',
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.current_password))

    def test_weak_new_password_is_rejected(self):
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': '123',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.current_password))

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.url,
            {
                'current_password': self.current_password,
                'new_password': 'NovaSenhaForte456',
            },
        )
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
