#!/usr/bin/env bash
# Script de build executado pelo Render a cada deploy.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
