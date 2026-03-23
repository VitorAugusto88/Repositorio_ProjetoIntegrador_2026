from django.contrib import admin
from .models import Appointment, Availability, SessionNote, Rating


@admin.register(Availability)
class AvailabilityAdmin(admin.ModelAdmin):
    list_display = ['professional', 'get_weekday_display', 'start_time', 'end_time', 'blocked']
    list_filter = ['weekday', 'blocked']
    search_fields = ['professional__user__full_name']


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ['patient', 'professional', 'scheduled_at', 'status', 'clinic']
    list_filter = ['status', 'clinic', 'scheduled_at']
    search_fields = ['patient__user__full_name', 'professional__user__full_name']
    ordering = ['-scheduled_at']


@admin.register(SessionNote)
class SessionNoteAdmin(admin.ModelAdmin):
    list_display = ['appointment', 'created_at']
    search_fields = ['appointment__patient__user__full_name']


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ['appointment', 'score', 'created_at']
    list_filter = ['score']