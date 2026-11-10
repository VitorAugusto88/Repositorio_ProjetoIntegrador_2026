from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, PatientProfile, ProfessionalProfile
from apps.notifications.utils import send_invitation_email, send_password_reset_email
from apps.uploads import replace_file_field, validate_no_replace_and_remove, validate_size

MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024


class CustomTokenObtainSerializer(TokenObtainPairSerializer):
    """
    Adiciona role e clinic_id ao payload do JWT.
    O frontend usa isso para saber qual interface mostrar
    sem precisar fazer uma requisição extra.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['full_name'] = user.full_name
        token['clinic_id'] = str(user.clinic_id) if user.clinic_id else None
        return token

    def validate(self, attrs):
        # O e-mail e gravado como o admin digitou no convite ("Maria@...").
        # Sem isto, "maria@..." no login era recusado — a recuperacao de senha
        # ja buscava por iexact, so o login diferenciava maiusculas.
        email = (attrs.get(self.username_field) or '').strip()
        cadastrado = (
            User.objects.filter(email__iexact=email)
            .values_list('email', flat=True)
            .first()
        )
        attrs[self.username_field] = cadastrado or email
        return super().validate(attrs)


class UserSerializer(serializers.ModelSerializer):
    patient_profile_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role',
            'clinic', 'is_active', 'created_at',
            'patient_profile_id',
        ]
        read_only_fields = ['id', 'email', 'role', 'clinic', 'is_active', 'created_at']

    def get_patient_profile_id(self, obj):
        try:
            return str(obj.patient_profile.id)
        except Exception:
            return None


class ProfessionalProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    # Flag write-only para remover a foto atual via multipart (um campo de
    # arquivo vazio não é interpretado como "limpar" pelo DRF).
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = ProfessionalProfile
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_photo(self, value):
        validate_size(value, MAX_PROFILE_PHOTO_SIZE, 'A foto não pode ser maior que 5MB.')
        return value

    def validate(self, attrs):
        validate_no_replace_and_remove(attrs, 'photo', 'remove_photo')
        return attrs

    def update(self, instance, validated_data):
        validated_data = replace_file_field(instance, 'photo', validated_data, 'remove_photo')
        return super().update(instance, validated_data)


class PatientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    # Dados completos do psicologo responsavel (nome, CRP, foto, bio), para o
    # frontend montar a tela "Meu psicologo" sem uma segunda requisicao.
    assigned_professional_detail = ProfessionalProfileSerializer(
        source='assigned_professional',
        read_only=True,
    )

    # Campos clinicos: histórico médico e anamnese são de responsabilidade do
    # profissional. Nem o paciente nem a secretaria (admin) devem visualizar/editar. Removemos
    # esses campos do serializer quando quem acessa e o paciente dono do perfil;
    # profissional e admin continuam com acesso normal.
    CLINICAL_FIELDS = ('medical_history', 'anamnesis')

    # Flag write-only para remover a foto atual via multipart (um campo de
    # arquivo vazio não é interpretado como "limpar" pelo DRF).
    remove_photo = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = PatientProfile
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and (
            getattr(user, 'is_patient', False) or getattr(user, 'is_admin', False)
        ):
            for field_name in self.CLINICAL_FIELDS:
                self.fields.pop(field_name, None)
        if user is not None and getattr(user, 'is_patient', False):
            # O paciente PRECISA ver com quem se consulta, mas nao escolhe: a
            # troca de psicologo e feita pelo administrador. Diferente dos
            # campos clinicos acima, o campo permanece visivel — so vira
            # somente-leitura, para que um PATCH do paciente nao o altere.
            assigned = self.fields.get('assigned_professional')
            if assigned is not None:
                assigned.read_only = True

    def validate_photo(self, value):
        validate_size(value, MAX_PROFILE_PHOTO_SIZE, 'A foto não pode ser maior que 5MB.')
        return value

    def validate(self, attrs):
        validate_no_replace_and_remove(attrs, 'photo', 'remove_photo')
        return attrs

    def update(self, instance, validated_data):
        validated_data = replace_file_field(instance, 'photo', validated_data, 'remove_photo')
        return super().update(instance, validated_data)


class PatientListSerializer(serializers.ModelSerializer):
    """
    Retorna PatientProfile com user aninhado.
    O campo 'id' e o PatientProfile.id — usado no POST /api/appointments/ como 'patient'.
    """
    user = UserSerializer(read_only=True)
    assigned_professional_detail = ProfessionalProfileSerializer(
        source='assigned_professional',
        read_only=True,
    )

    class Meta:
        model = PatientProfile
        fields = [
            'id', 'user', 'photo', 'birth_date', 'cpf', 'created_at',
            'assigned_professional', 'assigned_professional_detail',
        ]
        read_only_fields = fields


def ensure_role_profile(user, profile_data=None):
    profile_data = profile_data or {}

    if user.is_patient:
        PatientProfile.objects.get_or_create(user=user, defaults=profile_data)
        return

    if user.is_professional:
        ProfessionalProfile.objects.get_or_create(user=user, defaults=profile_data)


class AdminUserSerializer(serializers.ModelSerializer):
    patient_profile = PatientProfileSerializer(read_only=True)
    professional_profile = ProfessionalProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role', 'clinic',
            'is_active', 'created_at', 'updated_at',
            'patient_profile', 'professional_profile',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AdminUserCreateSerializer(serializers.ModelSerializer):
    crp = serializers.CharField(required=False, allow_blank=True, write_only=True)
    specialty = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bio = serializers.CharField(required=False, allow_blank=True, write_only=True)
    session_duration_minutes = serializers.IntegerField(required=False, write_only=True)
    photo = serializers.ImageField(required=False, allow_null=True, write_only=True)
    birth_date = serializers.DateField(required=False, allow_null=True, write_only=True)
    cpf = serializers.CharField(required=False, allow_blank=True, write_only=True)
    medical_history = serializers.CharField(required=False, allow_blank=True, write_only=True)
    anamnesis = serializers.CharField(required=False, allow_blank=True, write_only=True)
    emergency_contact_name = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    emergency_contact_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
    )
    # Psicologo responsavel — obrigatorio ao criar paciente (ver validate()).
    # Fica em required=False aqui porque o mesmo serializer tambem cria
    # profissionais, para os quais o campo nao se aplica.
    assigned_professional = serializers.PrimaryKeyRelatedField(
        queryset=ProfessionalProfile.objects.all(),
        required=False,
        write_only=True,
    )
    send_invite = serializers.BooleanField(default=True, write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'phone', 'role', 'clinic',
            'crp', 'specialty', 'bio', 'session_duration_minutes', 'photo',
            'birth_date', 'cpf', 'medical_history', 'anamnesis',
            'emergency_contact_name', 'emergency_contact_phone',
            'assigned_professional',
            'send_invite',
        ]
        read_only_fields = ['id']

    def validate_role(self, value):
        if value not in [User.Role.PATIENT, User.Role.PROFESSIONAL]:
            raise serializers.ValidationError(
                'A criacao interna permite apenas pacientes ou profissionais.'
            )
        return value

    def validate_photo(self, value):
        validate_size(value, MAX_PROFILE_PHOTO_SIZE, 'A foto não pode ser maior que 5MB.')
        return value

    def validate(self, attrs):
        request = self.context['request']
        creator = request.user
        role = attrs.get('role')

        if not creator.is_superuser:
            attrs['clinic'] = creator.clinic
        elif not attrs.get('clinic'):
            raise serializers.ValidationError(
                {'clinic': 'Superusers devem informar a clinica do usuario.'}
            )

        if role == User.Role.PROFESSIONAL and not attrs.get('crp'):
            raise serializers.ValidationError({'crp': 'CRP e obrigatorio.'})

        if role == User.Role.PATIENT:
            self._validate_assigned_professional(attrs)

        return attrs

    def _validate_assigned_professional(self, attrs):
        """
        Todo paciente nasce vinculado a um psicologo — quem escolhe e o
        administrador, no cadastro. O psicologo precisa ser da mesma clinica do
        paciente, senao o vinculo furaria o isolamento entre clinicas.
        """
        assigned = attrs.get('assigned_professional')

        if assigned is None:
            raise serializers.ValidationError(
                {'assigned_professional': 'Selecione o psicologo responsavel pelo paciente.'}
            )

        clinic = attrs.get('clinic')
        if clinic and assigned.user.clinic_id != clinic.id:
            raise serializers.ValidationError(
                {'assigned_professional': 'O psicologo deve pertencer a mesma clinica do paciente.'}
            )

    def create(self, validated_data):
        send_invite = validated_data.pop('send_invite', True)
        role = validated_data.get('role')
        profile_data = self._pop_profile_data(validated_data, role)
        user = User.objects.create_user(password=None, **validated_data)
        user.set_unusable_password()
        user.save(update_fields=['password'])
        ensure_role_profile(user, profile_data)

        if send_invite:
            send_invitation_email(user)

        return user

    def _pop_profile_data(self, data, role):
        patient_fields = [
            'birth_date', 'cpf', 'medical_history', 'anamnesis',
            'emergency_contact_name', 'emergency_contact_phone',
            'assigned_professional', 'photo',
        ]
        professional_fields = [
            'crp', 'specialty', 'bio', 'session_duration_minutes', 'photo',
        ]
        profile_data = {}
        allowed_fields = patient_fields if role == User.Role.PATIENT else professional_fields

        for field in patient_fields + professional_fields:
            if field not in data:
                continue
            value = data.pop(field)
            if field in allowed_fields:
                profile_data[field] = value

        return profile_data


class AdminPatientCreateSerializer(AdminUserCreateSerializer):
    def validate(self, attrs):
        attrs['role'] = User.Role.PATIENT
        return super().validate(attrs)


class AdminProfessionalCreateSerializer(AdminUserCreateSerializer):
    def validate(self, attrs):
        attrs['role'] = User.Role.PROFESSIONAL
        return super().validate(attrs)


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'phone', 'email']


class AdminUserRoleSerializer(serializers.ModelSerializer):
    crp = serializers.CharField(required=False, allow_blank=True, write_only=True)
    specialty = serializers.CharField(required=False, allow_blank=True, write_only=True)
    bio = serializers.CharField(required=False, allow_blank=True, write_only=True)
    session_duration_minutes = serializers.IntegerField(required=False, write_only=True)
    assigned_professional = serializers.PrimaryKeyRelatedField(
        queryset=ProfessionalProfile.objects.all(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            'role', 'crp', 'specialty', 'bio', 'session_duration_minutes',
            'assigned_professional',
        ]

    def validate_role(self, value):
        if value not in [User.Role.PATIENT, User.Role.PROFESSIONAL, User.Role.ADMIN]:
            raise serializers.ValidationError('Role invalida.')
        return value

    def validate(self, attrs):
        instance = self.instance
        role = attrs.get('role')

        if (
            role == User.Role.PROFESSIONAL
            and not hasattr(instance, 'professional_profile')
            and not attrs.get('crp')
        ):
            raise serializers.ValidationError(
                {'crp': 'CRP e obrigatorio para criar o perfil profissional.'}
            )

        # Virar paciente cria o PatientProfile, que exige o psicologo
        # responsavel. Sem essa checagem o get_or_create estouraria
        # IntegrityError e a API responderia 500 em vez de um erro de validacao.
        # Quem ja tem perfil mantem o vinculo atual, entao nada e exigido.
        if (
            role == User.Role.PATIENT
            and not hasattr(instance, 'patient_profile')
            and not attrs.get('assigned_professional')
        ):
            raise serializers.ValidationError(
                {'assigned_professional': 'Informe o psicologo responsavel para criar o perfil de paciente.'}
            )

        assigned = attrs.get('assigned_professional')
        if assigned and instance.clinic_id and assigned.user.clinic_id != instance.clinic_id:
            raise serializers.ValidationError(
                {'assigned_professional': 'O psicologo deve pertencer a mesma clinica do paciente.'}
            )

        return attrs

    PROFESSIONAL_PROFILE_FIELDS = ['crp', 'specialty', 'bio', 'session_duration_minutes']
    PATIENT_PROFILE_FIELDS = ['assigned_professional']

    def update(self, instance, validated_data):
        # Retira do payload todos os campos de perfil, mas repassa ao
        # ensure_role_profile apenas os do papel de destino: os defaults viram
        # kwargs do modelo, e um campo do perfil errado (um crp indo parar em
        # PatientProfile) estouraria TypeError.
        submitted = {
            field: validated_data.pop(field)
            for field in self.PROFESSIONAL_PROFILE_FIELDS + self.PATIENT_PROFILE_FIELDS
            if field in validated_data
        }
        instance = super().update(instance, validated_data)

        allowed = (
            self.PATIENT_PROFILE_FIELDS if instance.is_patient
            else self.PROFESSIONAL_PROFILE_FIELDS
        )
        profile_data = {k: v for k, v in submitted.items() if k in allowed}

        ensure_role_profile(instance, profile_data)
        return instance


class AdminUserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()

    def update(self, instance, validated_data):
        instance.is_active = validated_data['is_active']
        instance.save(update_fields=['is_active'])
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self):
        email = self.validated_data['email']
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user:
            send_password_reset_email(user)


class PasswordSetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    default_error_messages = {
        'invalid_token': 'Token invalido ou expirado.',
    }

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=uid, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            self.fail('invalid_token')

        if not default_token_generator.check_token(user, attrs['token']):
            self.fail('invalid_token')

        validate_password(attrs['password'], user)
        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """
    Troca de senha do usuario autenticado: confere a senha atual e aplica a
    nova. Sem e-mail (o fluxo por e-mail e so para quem NAO consegue logar).
    """
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    default_error_messages = {
        'wrong_password': 'Senha atual incorreta.',
    }

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            self.fail('wrong_password')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context['request'].user)
        return value

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
