# Serializers da Fase 2
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
        if data['start_time'] >= data['end_time']:
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

    def validate(self, data):
        professional = data.get('professional')
        scheduled_at = data.get('scheduled_at')
        if professional and scheduled_at:
            conflito = Appointment.objects.filter(
                professional=professional,
                scheduled_at=scheduled_at,
                status='scheduled'
            ).exists()
            if conflito:
                raise serializers.ValidationError(
                    'Este psicólogo já tem uma consulta agendada nesse horário.'
                )
        return data


class AppointmentCancelSerializer(serializers.ModelSerializer):
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
        instance.cancel_reason = validated_data.get('cancel_reason', '')
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