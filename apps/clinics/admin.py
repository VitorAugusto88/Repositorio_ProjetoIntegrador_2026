from django.contrib import admin
from .models import Clinic


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ['name', 'phone', 'email', 'open_from', 'open_until', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'email']
    ordering = ['name']