from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.models import AuditLog
from apps.audit.services import (
    changed_model_fields,
    log_audit_event,
    model_field_snapshot,
)

from .models import User, PatientProfile, ProfessionalProfile
from .serializers import (
    AdminPatientCreateSerializer,
    AdminProfessionalCreateSerializer,
    AdminUserRoleSerializer,
    AdminUserSerializer,
    AdminUserStatusSerializer,
    AdminUserUpdateSerializer,
    UserSerializer,
    PatientProfileSerializer,
    ProfessionalProfileSerializer,
    CustomTokenObtainSerializer,
    PatientListSerializer,
    PasswordResetRequestSerializer,
    PasswordSetConfirmSerializer,
    ChangePasswordSerializer,
)
from .permissions import (
    IsAdminOnly,
    IsPatientProfileInSameClinic,
    IsProfessionalOrAdmin,
    IsProfessionalProfileOwnerOrClinicAdmin,
)


PATIENT_PROFILE_AUDIT_FIELDS = [
    'birth_date',
    'cpf',
    'medical_history',
    'anamnesis',
    'emergency_contact_name',
    'emergency_contact_phone',
]
USER_PATIENT_AUDIT_FIELDS = ['email', 'full_name', 'phone', 'is_active', 'role']


def patient_audit_target(user):
    return getattr(user, 'patient_profile', None) or user


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Retorna access_token e refresh_token com role embutida.
    """
    serializer_class = CustomTokenObtainSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '')
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            # O simplejwt LANCA a excecao em credencial invalida (nao devolve
            # um 401 comum), entao a tentativa falha precisa ser registrada aqui.
            log_audit_event(
                action=AuditLog.Action.USER_LOGIN_FAILED,
                target_model='User',
                target_id='',
                target_repr=email,
                request=request,
                metadata={'email': email},
            )
            raise

        user = User.objects.filter(email__iexact=email).first()
        log_audit_event(
            action=AuditLog.Action.USER_LOGIN,
            target_model='User',
            target_id=str(user.id) if user else '',
            target_repr=email,
            request=request,
            metadata={'email': email},
        )
        return response


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Encerra a sessao colocando o refresh token na blacklist.
    Exige o refresh token no corpo: {"refresh": "<token>"}.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response(
                {'detail': 'O refresh token e obrigatorio para sair.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            # Token ja expirado/invalido: a sessao esta encerrada de qualquer forma.
            pass

        log_audit_event(
            action=AuditLog.Action.USER_LOGOUT,
            target_model='User',
            target_id=str(request.user.id),
            target_repr=request.user.email,
            request=request,
            metadata={'email': request.user.email},
        )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """
    GET  /api/auth/me/  — Retorna dados do usuario autenticado.
    PATCH /api/auth/me/ — Atualiza full_name e phone do usuario autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        allowed_fields = {'full_name', 'phone'}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}

        serializer = UserSerializer(request.user, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PatientProfileView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH /api/auth/patients/<uuid>/profile/
    Paciente ve e edita o proprio perfil.
    Profissional e admin podem editar a anamnese.
    """
    serializer_class = PatientProfileSerializer
    permission_classes = [IsPatientProfileInSameClinic]

    def get_queryset(self):
        user = self.request.user
        queryset = PatientProfile.objects.select_related('user')

        if user.is_superuser:
            return queryset

        if user.is_patient:
            return queryset.filter(user=user)

        if user.is_admin or user.is_professional:
            if not user.clinic_id:
                return queryset.none()
            return queryset.filter(user__clinic_id=user.clinic_id)

        return queryset.none()

    def get_object(self):
        patient_profile = generics.get_object_or_404(
            self.get_queryset(),
            user__id=self.kwargs['user_id']
        )
        self.check_object_permissions(self.request, patient_profile)
        return patient_profile

    def perform_update(self, serializer):
        before = model_field_snapshot(
            serializer.instance,
            PATIENT_PROFILE_AUDIT_FIELDS,
        )
        patient_profile = serializer.save()
        changed_fields = changed_model_fields(
            before,
            patient_profile,
            PATIENT_PROFILE_AUDIT_FIELDS,
        )

        if changed_fields:
            log_audit_event(
                action=AuditLog.Action.PATIENT_UPDATED,
                target=patient_profile,
                request=self.request,
                metadata={'changed_fields': changed_fields},
            )

        if 'anamnesis' in changed_fields:
            log_audit_event(
                action=AuditLog.Action.PATIENT_ANAMNESIS_UPDATED,
                target=patient_profile,
                request=self.request,
                metadata={'changed_fields': ['anamnesis']},
            )


class ProfessionalListView(generics.ListAPIView):
    """
    GET /api/auth/professionals/
    Lista psicologos disponiveis para a clinica do usuario logado.
    """
    serializer_class = ProfessionalProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        requested_clinic_id = self.request.query_params.get('clinic_id')

        qs = ProfessionalProfile.objects.select_related('user').filter(user__is_active=True)

        if user.is_superuser:
            if requested_clinic_id:
                return qs.filter(user__clinic_id=requested_clinic_id)
            return qs

        if not user.clinic_id:
            return qs.none()

        if requested_clinic_id and str(user.clinic_id) != requested_clinic_id:
            raise PermissionDenied('Voce nao pode listar profissionais de outra clinica.')

        return qs.filter(user__clinic_id=user.clinic_id)


class ProfessionalDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/auth/professionals/<uuid>/
    PATCH /api/auth/professionals/<uuid>/
    Psicólogo edita o próprio perfil. Admin edita qualquer profissional da clínica.
    """
    serializer_class = ProfessionalProfileSerializer
    permission_classes = [IsProfessionalProfileOwnerOrClinicAdmin]

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return ProfessionalProfile.objects.select_related('user').all()

        # Admin ve apenas profissionais da propria clinica
        if user.is_admin:
            return ProfessionalProfile.objects.select_related('user').filter(
                user__clinic_id=user.clinic_id
            )

        # Psicologo ve apenas o proprio perfil
        return ProfessionalProfile.objects.select_related('user').filter(
            user=user
        )


class ClinicPatientListView(generics.ListAPIView):
    """
    GET /api/auth/<clinic_id>/patients/
    Lista os pacientes da clinica como PatientProfile.
    Retorna PatientProfile.id no campo 'id' — necessario para POST /api/appointments/.
    - Admin ve todos os pacientes da propria clinica
    - Psicologo ve apenas pacientes com quem tem consulta
    """
    serializer_class = PatientListSerializer
    permission_classes = [IsProfessionalOrAdmin]

    def get_queryset(self):
        clinic_id = str(self.kwargs['pk'])
        user = self.request.user

        # A resposta e paginada (PAGE_SIZE=20). Sem ordenacao explicita o corte
        # entre paginas fica a criterio do banco e pode variar a cada requisicao,
        # fazendo pacientes sumirem/repetirem na lista.
        if user.is_superuser:
            return PatientProfile.objects.select_related('user').filter(
                user__clinic_id=clinic_id,
                user__is_active=True
            ).order_by('user__full_name')

        if not user.clinic_id or str(user.clinic_id) != clinic_id:
            raise PermissionDenied('Voce nao pode acessar pacientes de outra clinica.')

        if user.is_admin:
            return PatientProfile.objects.select_related('user').filter(
                user__clinic_id=user.clinic_id,
                user__is_active=True
            ).order_by('user__full_name')

        if user.is_professional:
            professional_profile = getattr(user, 'professional_profile', None)
            if professional_profile is None:
                return PatientProfile.objects.none()

            # O psicologo ve os pacientes sob sua responsabilidade (vinculo
            # definido pelo administrador em assigned_professional) mesmo que
            # ainda nao exista consulta marcada, alem daqueles com quem ja teve
            # consulta na clinica — util quando o paciente foi remanejado para
            # outro psicologo depois do atendimento.
            return PatientProfile.objects.select_related('user').filter(
                Q(assigned_professional=professional_profile)
                | Q(
                    appointments__professional=professional_profile,
                    appointments__clinic_id=user.clinic_id,
                ),
                user__clinic_id=user.clinic_id,
                user__is_active=True,
            ).distinct().order_by('user__full_name')

        return PatientProfile.objects.none()


class AdminUserQuerysetMixin:
    def get_queryset(self):
        user = self.request.user
        # Contas arquivadas (excluídas com preservação de dados clínicos) somem
        # das listas e não podem mais ser gerenciadas por aqui.
        queryset = User.objects.select_related(
            'clinic',
            'patient_profile',
            'professional_profile',
        ).filter(is_archived=False)

        if user.is_superuser:
            clinic_id = self.request.query_params.get('clinic_id')
            if clinic_id:
                return queryset.filter(clinic_id=clinic_id)
            return queryset

        if not user.clinic_id:
            return queryset.none()

        return queryset.filter(clinic_id=user.clinic_id)


class AdminUserListView(AdminUserQuerysetMixin, generics.ListAPIView):
    """
    GET /api/auth/admin/users/
    Lista usuarios da clinica do admin logado.
    Superusers podem filtrar por ?clinic_id=.
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminOnly]


class AdminPatientCreateView(generics.CreateAPIView):
    """
    POST /api/auth/admin/users/patients/
    Cria paciente interno e envia convite para definicao de senha.
    """
    serializer_class = AdminPatientCreateSerializer
    permission_classes = [IsAdminOnly]

    def perform_create(self, serializer):
        user = serializer.save()
        log_audit_event(
            action=AuditLog.Action.PATIENT_CREATED,
            target=patient_audit_target(user),
            request=self.request,
            metadata={
                'user_id': str(user.id),
                'email': user.email,
                'send_invite': serializer.validated_data.get('send_invite', True),
            },
        )


class AdminProfessionalCreateView(generics.CreateAPIView):
    """
    POST /api/auth/admin/users/professionals/
    Cria profissional interno e envia convite para definicao de senha.
    """
    serializer_class = AdminProfessionalCreateSerializer
    permission_classes = [IsAdminOnly]


class AdminUserDetailView(AdminUserQuerysetMixin, generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/auth/admin/users/<uuid>/
    - PATCH edita dados basicos sem alterar role ou status.
    - DELETE exclui a conta. Com ?preserve_clinical_data=true a conta e apenas
      arquivada/anonimizada (documentos e consultas ficam preservados); caso
      contrario o usuario e apagado de vez, junto com todos os dados em cascata.
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminOnly]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return AdminUserUpdateSerializer
        return AdminUserSerializer

    def _wants_preserve(self, request):
        raw = request.query_params.get('preserve_clinical_data')
        if raw is None and isinstance(request.data, dict):
            raw = request.data.get('preserve_clinical_data')
        return str(raw).lower() in ('true', '1', 'yes')

    def _assigned_patients_blocker(self, user):
        """
        Impede remover um psicologo que ainda e responsavel por pacientes.

        Vale para os DOIS caminhos de exclusao. No caminho que apaga de vez, o
        PROTECT do banco ja recusaria a operacao, mas com ProtectedError — um
        500 sem explicacao; aqui devolvemos 400 com instrucao. Ja o caminho que
        arquiva nem chega no PROTECT (o ProfessionalProfile continua existindo),
        e sem esta checagem os pacientes ficariam presos a um profissional
        inativo, sem conseguir agendar e sem nenhum aviso.

        Retorna a mensagem de bloqueio, ou None quando a remocao e permitida.
        """
        profile = getattr(user, 'professional_profile', None)
        if profile is None:
            return None

        total = profile.assigned_patients.count()
        if not total:
            return None

        plural = 'paciente vinculado' if total == 1 else 'pacientes vinculados'
        return (
            f'Este psicologo ainda tem {total} {plural}. '
            'Transfira esses pacientes para outro psicologo antes de remove-lo.'
        )

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()

        if user.id == request.user.id:
            return Response(
                {'detail': 'Voce nao pode excluir a propria conta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        blocker = self._assigned_patients_blocker(user)
        if blocker:
            return Response(
                {'detail': blocker},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self._wants_preserve(request):
            # Excluir preservando dados clinicos: anonimiza e arquiva.
            user.archive()
        else:
            # Excluir tudo: apaga o usuario e, em cascata, perfil, documentos,
            # consultas e mensagens.
            user.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_update(self, serializer):
        before = model_field_snapshot(
            serializer.instance,
            USER_PATIENT_AUDIT_FIELDS,
        )
        user = serializer.save()
        changed_fields = changed_model_fields(
            before,
            user,
            USER_PATIENT_AUDIT_FIELDS,
        )

        if changed_fields and user.is_patient:
            log_audit_event(
                action=AuditLog.Action.PATIENT_UPDATED,
                target=patient_audit_target(user),
                request=self.request,
                metadata={'changed_fields': changed_fields},
            )


class AdminUserStatusView(AdminUserQuerysetMixin, generics.UpdateAPIView):
    """
    PATCH /api/auth/admin/users/<uuid>/status/
    Ativa ou desativa uma conta.
    """
    serializer_class = AdminUserStatusSerializer
    permission_classes = [IsAdminOnly]

    def perform_update(self, serializer):
        before = model_field_snapshot(serializer.instance, ['is_active'])
        user = serializer.save()
        changed_fields = changed_model_fields(before, user, ['is_active'])

        if changed_fields and user.is_patient:
            log_audit_event(
                action=AuditLog.Action.PATIENT_UPDATED,
                target=patient_audit_target(user),
                request=self.request,
                metadata={'changed_fields': changed_fields},
            )


class AdminUserRoleView(AdminUserQuerysetMixin, generics.UpdateAPIView):
    """
    PATCH /api/auth/admin/users/<uuid>/role/
    Altera role e cria o perfil necessario quando aplicavel.
    """
    serializer_class = AdminUserRoleSerializer
    permission_classes = [IsAdminOnly]

    def perform_update(self, serializer):
        before = model_field_snapshot(serializer.instance, ['role'])
        was_patient = serializer.instance.is_patient
        user = serializer.save()
        changed_fields = changed_model_fields(before, user, ['role'])

        if changed_fields and (was_patient or user.is_patient):
            log_audit_event(
                action=AuditLog.Action.PATIENT_UPDATED,
                target=patient_audit_target(user),
                request=self.request,
                metadata={'changed_fields': changed_fields},
            )


class PasswordResetRequestView(generics.GenericAPIView):
    """
    POST /api/auth/password/reset/
    Solicita recuperacao de senha por email.
    """
    serializer_class = PasswordResetRequestSerializer
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            'detail': 'Se o email existir, enviaremos instrucoes de recuperacao.'
        })


class PasswordResetConfirmView(generics.GenericAPIView):
    """
    POST /api/auth/password/reset/confirm/
    Define uma nova senha usando uid e token.
    """
    serializer_class = PasswordSetConfirmSerializer
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset_confirm'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Senha atualizada com sucesso.'})


class PasswordInviteConfirmView(PasswordResetConfirmView):
    """
    POST /api/auth/password/invite/confirm/
    Define a senha inicial usando uid e token do convite.
    """


class ChangePasswordView(generics.GenericAPIView):
    """
    POST /api/auth/password/change/
    Troca a senha do usuario autenticado (senha atual + nova). Sem e-mail.
    """
    serializer_class = ChangePasswordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Senha atualizada com sucesso.'})
