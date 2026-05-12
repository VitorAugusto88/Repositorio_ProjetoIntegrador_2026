# Serializers da Fase 2
from datetime import timedelta

from rest_framework import serializers
from django.utils import timezone
from .models import Appointment, Availability, SessionNote, Rating
from apps.accounts.serializers import ProfessionalProfileSerializer, PatientProfileSerializer
from apps.accounts.models import PatientProfile


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
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)

    # required=False permite que pacientes não enviem 'patient' no body —
    # perform_create injeta user.patient_profile automaticamente para eles.
    # Admin e profissional devem enviar o UUID explicitamente.
    patient = serializers.PrimaryKeyRelatedField(
        queryset=PatientProfile.objects.all(),
        required=False,
    )

    class Meta:
        model = Appointment
        fields = [
            'id', 'patient', 'professional', 'clinic',
            'scheduled_at', 'duration_minutes', 'status', 'status_display',
            'cancel_reason', 'can_cancel',
            'professional_detail', 'patient_detail',
            'created_at', 'updated_at',
        ]
        # 'patient' removido de read_only_fields para que admin/profissional
        # possam passar o UUID no body. perform_create injeta o valor para pacientes.
        read_only_fields = ['id', 'created_at', 'updated_at']

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

        self._validate_same_clinic(patient, professional, clinic)
        self._validate_user_scope(user, patient, professional, clinic)

        if self._should_validate_schedule(data):
            self._validate_duration(duration_minutes)
            self._validate_professional_availability(
                professional=professional,
                scheduled_at=scheduled_at,
                duration_minutes=duration_minutes,
            )
            self._validate_schedule_conflicts(
                professional=professional,
                clinic=clinic,
                scheduled_at=scheduled_at,
                duration_minutes=duration_minutes,
            )

        return data

    def _should_validate_schedule(self, data):
        if self.instance is None:
            return True

        scheduling_fields = {
            'scheduled_at', 'duration_minutes', 'professional', 'clinic'
        }
        if scheduling_fields.intersection(data.keys()):
            return True

        return data.get('status') == Appointment.Status.RESCHEDULED

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
    cancel_reason = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
    )

    class Meta:
        model = Appointment
        fields = ['cancel_reason']

    def validate(self, data):
        if not self.instance.can_cancel():
            raise serializers.ValidationError(
                'Não é possível cancelar com menos de 24h de antecedência.'
            )
        return data

    def update(self, instance, validated_data):
        instance.status = Appointment.Status.CANCELLED
        instance.cancel_reason = validated_data['cancel_reason']
        instance.save()
        return instance


class SessionNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionNote
        fields = ['id', 'appointment', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class RatingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rating
        fields = ['id', 'appointment', 'score', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_score(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError('A nota deve ser entre 1 e 5.')
        return value

    def validate_appointment(self, value):
        if value.status != Appointment.Status.COMPLETED:
            raise serializers.ValidationError(
                'Só é possível avaliar consultas já realizadas.'
            )
        if hasattr(value, 'rating'):
            raise serializers.ValidationError('Esta consulta já foi avaliada.')
        return value
