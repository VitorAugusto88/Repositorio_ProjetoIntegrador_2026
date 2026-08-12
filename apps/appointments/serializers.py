# Serializers da Fase 2
from datetime import timedelta

from rest_framework import serializers
from django.utils import timezone
from .models import Appointment, Availability, SessionNote
from apps.accounts.serializers import ProfessionalProfileSerializer, PatientProfileSerializer
from apps.accounts.models import PatientProfile, ProfessionalProfile


class AvailabilitySerializer(serializers.ModelSerializer):
    """
    Horários disponíveis do psicólogo.
    O frontend usa isso para montar o calendário de agendamento.
    """
    weekday_display = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = Availability
        fields = [
            'id', 'professional', 'weekday', 'weekday_display',
            'start_time', 'end_time', 'blocked'
        ]
        read_only_fields = ['id']

    def validate(self, data):
        start_time = data.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = data.get('end_time', getattr(self.instance, 'end_time', None))

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError(
                'O horário de início deve ser antes do horário de fim.'
            )
        return data


class AppointmentSerializer(serializers.ModelSerializer):
    professional_detail = ProfessionalProfileSerializer(source='professional', read_only=True)
    patient_detail = PatientProfileSerializer(source='patient', read_only=True)
    # status_display mostra "Dia Ultrapassado" quando a consulta segue em aberto
    # e o dia dela já passou. O `status` gravado continua sendo 'scheduled'/
    # 'rescheduled' — o estado é só de exibição (ver Appointment.is_overdue).
    status_display = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)

    # required=False permite que pacientes não enviem 'patient' no body —
    # perform_create injeta user.patient_profile automaticamente para eles.
    # Admin e profissional devem enviar o UUID explicitamente.
    patient = serializers.PrimaryKeyRelatedField(
        queryset=PatientProfile.objects.all(),
        required=False,
    )

    # Mesmo motivo do 'patient' acima: o paciente nao envia 'professional' — a
    # consulta e sempre com o psicologo vinculado ao perfil dele, preenchido em
    # _enforce_assigned_professional. O profissional tambem nao envia (a view
    # injeta o proprio perfil no perform_create). Para admin e superuser o campo
    # segue obrigatorio, cobrado em validate().
    professional = serializers.PrimaryKeyRelatedField(
        queryset=ProfessionalProfile.objects.all(),
        required=False,
    )

    # Flag opcional (não é campo do modelo) para, excepcionalmente, agendar
    # ignorando a disponibilidade do profissional. Só é honrado para staff
    # (admin/profissional). O conflito de horário continua sendo validado.
    ignore_availability = serializers.BooleanField(
        write_only=True, required=False, default=False
    )

    class Meta:
        model = Appointment
        fields = [
            'id', 'patient', 'professional', 'clinic',
            'scheduled_at', 'duration_minutes', 'status', 'status_display',
            'is_overdue',
            'cancel_reason', 'can_cancel', 'completed_at', 'ignore_availability',
            'professional_detail', 'patient_detail',
            'created_at', 'updated_at',
        ]
        # 'patient' removido de read_only_fields para que admin/profissional
        # possam passar o UUID no body. perform_create injeta o valor para pacientes.
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_status_display(self, obj):
        if obj.is_overdue:
            return Appointment.OVERDUE_LABEL
        return obj.get_status_display()

    def validate_scheduled_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError(
                'Não é possível agendar uma consulta no passado.'
            )
        return value

    def _legacy_validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        professional = data.get(
            'professional',
            getattr(self.instance, 'professional', None)
        )
        patient = data.get('patient', getattr(self.instance, 'patient', None))
        clinic = data.get('clinic', getattr(self.instance, 'clinic', None))
        scheduled_at = data.get(
            'scheduled_at',
            getattr(self.instance, 'scheduled_at', None)
        )

        if user and user.is_authenticated and not user.is_superuser:
            if not user.clinic_id:
                raise serializers.ValidationError('Usuario sem clinica vinculada.')

            if clinic and clinic.id != user.clinic_id:
                raise serializers.ValidationError(
                    'A consulta deve pertencer a sua clinica.'
                )

            if professional and professional.user.clinic_id != user.clinic_id:
                raise serializers.ValidationError(
                    'O profissional deve pertencer a sua clinica.'
                )

            if patient and patient.user.clinic_id != user.clinic_id:
                raise serializers.ValidationError(
                    'O paciente deve pertencer a sua clinica.'
                )

            if user.is_professional:
                user_professional = getattr(user, 'professional_profile', None)
                if user_professional is None:
                    raise serializers.ValidationError(
                        'Perfil profissional nao encontrado.'
                    )
                if professional and professional.id != user_professional.id:
                    raise serializers.ValidationError(
                        'Profissionais so podem gerenciar suas proprias consultas.'
                    )

            if user.is_patient:
                user_patient = getattr(user, 'patient_profile', None)
                if user_patient is None:
                    raise serializers.ValidationError(
                        'Perfil de paciente nao encontrado.'
                    )
                if patient and patient.id != user_patient.id:
                    raise serializers.ValidationError(
                        'Pacientes so podem gerenciar suas proprias consultas.'
                    )

        if professional and scheduled_at:
            conflito = Appointment.objects.filter(
                professional=professional,
                scheduled_at=scheduled_at,
                status='scheduled'
            )
            if clinic:
                conflito = conflito.filter(clinic=clinic)
            if self.instance:
                conflito = conflito.exclude(pk=self.instance.pk)

            if conflito.exists():
                raise serializers.ValidationError(
                    'Este psicólogo já tem uma consulta agendada nesse horário.'
                )
        return data

    def validate(self, data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        # "Ignorar disponibilidade": só honrado para staff (admin/profissional).
        # Removido de data para não vazar para o save() (não é campo do modelo).
        ignore_availability = data.pop('ignore_availability', False)
        is_staff = bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.is_admin or user.is_professional)
        )
        ignore_availability = ignore_availability and is_staff

        professional = data.get(
            'professional',
            getattr(self.instance, 'professional', None)
        )
        patient = data.get('patient', getattr(self.instance, 'patient', None))
        clinic = data.get('clinic', getattr(self.instance, 'clinic', None))
        scheduled_at = data.get(
            'scheduled_at',
            getattr(self.instance, 'scheduled_at', None)
        )
        duration_minutes = data.get(
            'duration_minutes',
            getattr(self.instance, 'duration_minutes', 50)
        )

        if user and user.is_authenticated:
            if patient is None and user.is_patient:
                patient = getattr(user, 'patient_profile', None)
            if professional is None and user.is_professional:
                professional = getattr(user, 'professional_profile', None)
            if clinic is None and not user.is_superuser:
                clinic = user.clinic

        professional = self._enforce_assigned_professional(
            user=user,
            patient=patient,
            professional=professional,
            data=data,
        )

        # O campo deixou de ser obrigatorio no nivel do DRF para que paciente e
        # profissional possam omiti-lo (cada um tem o seu resolvido acima). Quem
        # nao se encaixa nesses dois casos — admin e superuser — precisa
        # informar, senao o save() estouraria IntegrityError.
        if self.instance is None and professional is None:
            raise serializers.ValidationError(
                {'professional': 'Informe o psicologo da consulta.'}
            )

        self._validate_same_clinic(patient, professional, clinic)
        self._validate_user_scope(user, patient, professional, clinic)

        # Validações de mudança de status e trava de consultas terminais —
        # só se aplicam em atualização (self.instance existe).
        if self.instance is not None:
            self._validate_terminal_lock(data)
            self._validate_status_transition(data)

        if self._should_validate_schedule(data):
            self._validate_duration(duration_minutes)
            if not ignore_availability:
                self._validate_professional_availability(
                    professional=professional,
                    scheduled_at=scheduled_at,
                    duration_minutes=duration_minutes,
                )
            # O conflito de horário é sempre validado, mesmo ignorando a disponibilidade.
            self._validate_schedule_conflicts(
                professional=professional,
                clinic=clinic,
                scheduled_at=scheduled_at,
                duration_minutes=duration_minutes,
            )

        return data

    # Transições de status permitidas (a partir do status atual).
    # 'cancelled' é terminal; 'completed'/'no_show' só permitem desfazer para 'scheduled'.
    ALLOWED_STATUS_TRANSITIONS = {
        Appointment.Status.SCHEDULED: {
            Appointment.Status.SCHEDULED,
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.RESCHEDULED,
            Appointment.Status.NO_SHOW,
        },
        Appointment.Status.RESCHEDULED: {
            Appointment.Status.RESCHEDULED,
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.SCHEDULED,
            Appointment.Status.NO_SHOW,
        },
        Appointment.Status.COMPLETED: {
            Appointment.Status.COMPLETED,
            Appointment.Status.SCHEDULED,
        },
        Appointment.Status.NO_SHOW: {
            Appointment.Status.NO_SHOW,
            Appointment.Status.SCHEDULED,
        },
        Appointment.Status.CANCELLED: {
            Appointment.Status.CANCELLED,
        },
    }

    def _validate_terminal_lock(self, data):
        """Bloqueia alterar os campos-núcleo de uma consulta concluída/cancelada."""
        current_status = getattr(self.instance, 'status', None)
        if current_status not in (
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
        ):
            return

        locked_fields = [
            'patient', 'professional', 'clinic', 'scheduled_at', 'duration_minutes'
        ]
        for field in locked_fields:
            if field in data and data[field] != getattr(self.instance, field):
                raise serializers.ValidationError(
                    'Consulta concluída ou cancelada não pode ter seus dados alterados.'
                )

    def _validate_status_transition(self, data):
        """Valida a mudança de status e preenche/limpa completed_at."""
        if 'status' not in data:
            return

        old_status = getattr(self.instance, 'status', None)
        new_status = data['status']

        allowed = self.ALLOWED_STATUS_TRANSITIONS.get(old_status, set())
        if new_status not in allowed:
            raise serializers.ValidationError(
                {'status': f'Transição de status não permitida a partir de "{old_status}".'}
            )

        if new_status == Appointment.Status.COMPLETED:
            # Data de realização: usa a informada ou assume agora. Nunca no futuro.
            completed_at = data.get('completed_at') or timezone.now()
            if completed_at > timezone.now():
                raise serializers.ValidationError(
                    {'completed_at': 'A data de realização não pode ser no futuro.'}
                )
            data['completed_at'] = completed_at

        elif new_status == Appointment.Status.NO_SHOW:
            scheduled_at = getattr(self.instance, 'scheduled_at', None)
            if scheduled_at and scheduled_at > timezone.now():
                raise serializers.ValidationError(
                    {'status': 'Não é possível marcar falta em uma consulta futura.'}
                )

        elif new_status == Appointment.Status.RESCHEDULED:
            if 'scheduled_at' not in data:
                raise serializers.ValidationError(
                    {'scheduled_at': 'Informe a nova data ao remarcar a consulta.'}
                )
            if data['scheduled_at'] == getattr(self.instance, 'scheduled_at', None):
                raise serializers.ValidationError(
                    {'scheduled_at': 'A nova data deve ser diferente da atual.'}
                )

        # Ao sair de "concluída" (desfazer), limpa a data de realização.
        if old_status == Appointment.Status.COMPLETED and new_status != Appointment.Status.COMPLETED:
            data['completed_at'] = None

    def _should_validate_schedule(self, data):
        if self.instance is None:
            return True

        scheduling_fields = {
            'scheduled_at', 'duration_minutes', 'professional', 'clinic'
        }
        if scheduling_fields.intersection(data.keys()):
            return True

        return data.get('status') == Appointment.Status.RESCHEDULED

    def _enforce_assigned_professional(self, user, patient, professional, data):
        """
        Trava o paciente no psicologo responsavel pelo seu perfil.

        O paciente nao escolhe com quem se consulta — o vinculo e definido pelo
        administrador no cadastro (PatientProfile.assigned_professional) e so
        ele pode altera-lo. Esconder o seletor no aplicativo nao basta: sem esta
        checagem um POST direto na API continuaria agendando com qualquer
        profissional da clinica.

        Staff (admin, profissional e superuser) NAO passa por aqui — precisa
        poder marcar com um substituto quando o titular esta de ferias. E o
        mesmo criterio de staff aplicado em ignore_availability.
        """
        is_patient_request = bool(
            user
            and user.is_authenticated
            and user.is_patient
            and not user.is_superuser
        )
        if not is_patient_request or patient is None:
            return professional

        assigned = patient.assigned_professional

        # Alteracao de consulta existente: o paciente pode remarcar horario, mas
        # nao trocar o profissional. A consulta pode ter sido criada pela
        # secretaria com um substituto, entao comparamos com o que ja esta
        # gravado — e nao com o vinculo — para nao travar essa remarcacao.
        if self.instance is not None:
            if 'professional' in data and data['professional'] != self.instance.professional:
                raise serializers.ValidationError(
                    {'professional': 'Voce nao pode trocar o psicologo da consulta. Solicite ao administrador da clinica.'}
                )
            return professional

        if professional is not None and professional.id != assigned.id:
            raise serializers.ValidationError(
                {'professional': 'Voce so pode agendar com o seu psicologo responsavel. Para trocar, solicite ao administrador da clinica.'}
            )

        data['professional'] = assigned
        return assigned

    def _validate_duration(self, duration_minutes):
        if duration_minutes <= 0:
            raise serializers.ValidationError(
                {'duration_minutes': 'A duracao deve ser maior que zero.'}
            )

    def _validate_same_clinic(self, patient, professional, clinic):
        if not all([patient, professional, clinic]):
            return

        clinic_id = clinic.id
        if patient.user.clinic_id != clinic_id:
            raise serializers.ValidationError(
                'Paciente e consulta devem pertencer a mesma clinica.'
            )

        if professional.user.clinic_id != clinic_id:
            raise serializers.ValidationError(
                'Profissional e consulta devem pertencer a mesma clinica.'
            )

    def _validate_user_scope(self, user, patient, professional, clinic):
        if not user or not user.is_authenticated or user.is_superuser:
            return

        if not user.clinic_id:
            raise serializers.ValidationError('Usuario sem clinica vinculada.')

        if clinic and clinic.id != user.clinic_id:
            raise serializers.ValidationError(
                'A consulta deve pertencer a sua clinica.'
            )

        if professional and professional.user.clinic_id != user.clinic_id:
            raise serializers.ValidationError(
                'O profissional deve pertencer a sua clinica.'
            )

        if patient and patient.user.clinic_id != user.clinic_id:
            raise serializers.ValidationError(
                'O paciente deve pertencer a sua clinica.'
            )

        if user.is_professional:
            user_professional = getattr(user, 'professional_profile', None)
            if user_professional is None:
                raise serializers.ValidationError(
                    'Perfil profissional nao encontrado.'
                )
            if professional and professional.id != user_professional.id:
                raise serializers.ValidationError(
                    'Profissionais so podem gerenciar suas proprias consultas.'
                )

        if user.is_patient:
            user_patient = getattr(user, 'patient_profile', None)
            if user_patient is None:
                raise serializers.ValidationError(
                    'Perfil de paciente nao encontrado.'
                )
            if patient and patient.id != user_patient.id:
                raise serializers.ValidationError(
                    'Pacientes so podem gerenciar suas proprias consultas.'
                )

    def _validate_professional_availability(
        self,
        professional,
        scheduled_at,
        duration_minutes,
    ):
        if not professional or not scheduled_at:
            return

        start_at = timezone.localtime(scheduled_at)
        end_at = timezone.localtime(
            scheduled_at + timedelta(minutes=duration_minutes)
        )

        if start_at.date() != end_at.date():
            raise serializers.ValidationError(
                'A consulta nao pode atravessar dias diferentes.'
            )

        weekday = start_at.weekday()
        start_time = start_at.time()
        end_time = end_at.time()

        has_available_slot = Availability.objects.filter(
            professional=professional,
            weekday=weekday,
            blocked=False,
            start_time__lte=start_time,
            end_time__gte=end_time,
        ).exists()

        if not has_available_slot:
            raise serializers.ValidationError(
                'Horario fora da disponibilidade do profissional.'
            )

        has_block = Availability.objects.filter(
            professional=professional,
            weekday=weekday,
            blocked=True,
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exists()

        if has_block:
            raise serializers.ValidationError(
                'Horario bloqueado na agenda do profissional.'
            )

    def _validate_schedule_conflicts(
        self,
        professional,
        clinic,
        scheduled_at,
        duration_minutes,
    ):
        if not professional or not scheduled_at:
            return

        end_at = scheduled_at + timedelta(minutes=duration_minutes)
        queryset = Appointment.objects.filter(
            professional=professional,
            scheduled_at__lt=end_at,
            status__in=[
                Appointment.Status.SCHEDULED,
                Appointment.Status.RESCHEDULED,
            ],
        )

        if clinic:
            queryset = queryset.filter(clinic=clinic)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        for appointment in queryset.only('scheduled_at', 'duration_minutes'):
            if appointment.ends_at > scheduled_at:
                raise serializers.ValidationError(
                    'O profissional ja possui consulta sobreposta neste horario.'
                )


class AppointmentCancelSerializer(serializers.ModelSerializer):
    # Motivo é opcional — admin/profissional podem cancelar sem justificar.
    cancel_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    class Meta:
        model = Appointment
        fields = ['cancel_reason']

    def validate(self, data):
        # Consulta já concluída ou cancelada não pode ser cancelada.
        # (A antiga trava de 24h de antecedência foi removida — cancelamento livre.)
        if self.instance.status in (
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
        ):
            raise serializers.ValidationError(
                'Esta consulta não pode ser cancelada.'
            )
        return data

    def update(self, instance, validated_data):
        instance.status = Appointment.Status.CANCELLED
        instance.cancel_reason = validated_data.get('cancel_reason', '')
        instance.save()
        return instance


class SessionNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionNote
        fields = ['id', 'appointment', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
