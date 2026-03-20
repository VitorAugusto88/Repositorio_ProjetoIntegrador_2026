# Clínica Backend — Django REST API

## Estrutura do projeto

```
clinica_backend/
├── config/                  # Configurações globais
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── apps/
│   ├── accounts/            # Usuários, autenticação, perfis
│   ├── clinics/             # Clínicas
│   ├── appointments/        # Consultas, disponibilidade, notas
│   ├── records/             # Documentos dos pacientes
│   ├── chat/                # Mensagens
│   └── notifications/       # Notificações
├── requirements.txt
├── manage.py
└── .env.example
```

---

## Pré-requisitos

- Python 3.11 ou 3.12
- PostgreSQL 15+

---

## Configurando o ambiente (cada membro do grupo faz isso uma vez)

### 1. Clone o repositório

```bash
git clone <url-do-repo>
cd clinica_backend
```

### 2. Crie e ative o ambiente virtual

```bash
# Criar
python -m venv venv

# Ativar no Linux/Mac
source venv/bin/activate

# Ativar no Windows
venv\Scripts\activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Configure o banco PostgreSQL

Abra o psql ou pgAdmin e rode:

```sql
CREATE DATABASE clinica_db;
CREATE USER clinica_user WITH PASSWORD 'clinica_pass';
GRANT ALL PRIVILEGES ON DATABASE clinica_db TO clinica_user;
```

### 5. Configure o .env

```bash
cp .env.example .env
```

Abra o `.env` e ajuste se necessário. Para desenvolvimento local os valores padrão já funcionam.

### 6. Rode as migrations

```bash
python manage.py migrate
```

### 7. Crie o superusuário (admin)

```bash
python manage.py createsuperuser
```

### 8. Inicie o servidor

```bash
python manage.py runserver
```

API disponível em: http://localhost:8000

Admin disponível em: http://localhost:8000/admin

---

## Endpoints da Fase 1

### Autenticação

| Método | URL | Descrição | Auth? |
|--------|-----|-----------|-------|
| POST | `/api/auth/register/` | Cadastro de paciente | Não |
| POST | `/api/auth/login/` | Login — retorna tokens JWT | Não |
| POST | `/api/auth/refresh/` | Renova o access token | Não |
| GET | `/api/auth/me/` | Dados do usuário logado | Sim |
| GET/PATCH | `/api/auth/patients/<id>/profile/` | Perfil do paciente | Sim |
| GET | `/api/auth/professionals/` | Lista psicólogos | Sim |

### Como usar o token nas requisições

```
Authorization: Bearer <access_token>
```

### Exemplo de login

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "paciente@email.com", "password": "senha123"}'
```

Resposta:
```json
{
  "access": "eyJ...",
  "refresh": "eyJ..."
}
```

O access token já vem com `role`, `full_name` e `clinic_id` embutidos.
O frontend pode decodificar o JWT para saber qual interface mostrar.

---

## Para os colegas de frontend

### URL base
```
http://localhost:8000/api/
```

### Autenticação
Todas as rotas (exceto login e register) exigem o header:
```
Authorization: Bearer <access_token>
```

### Roles disponíveis
- `patient` — paciente
- `professional` — psicólogo
- `admin` — administrador da clínica

### CORS
O backend já aceita requisições de:
- `http://localhost:3000` (React Web)
- `http://localhost:8081` (React Native / Expo)

---

## Git — o que NÃO commitar

Adicione ao `.gitignore`:

```
venv/
.env
*.pyc
__pycache__/
media/
staticfiles/
db.sqlite3
```
