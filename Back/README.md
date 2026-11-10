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

## Rodando os testes

O banco configurado no `.env` é um Postgres gerenciado, que não permite criar o
banco temporário `test_*` exigido pelo runner do Django. Por isso a suíte roda com
`config/settings_test.py`, que troca o banco por SQLite em memória (nenhum modelo
usa campo específico de Postgres) e desliga Redis/SMTP.

```bash
python manage.py test --settings=config.settings_test              # tudo
python manage.py test apps.clinics --settings=config.settings_test # um app
python manage.py test apps.appointments.tests.AppointmentRoomTests --settings=config.settings_test
python manage.py makemigrations --check --dry-run --settings=config.settings_test
```

## Salas de atendimento

| Método | URL | Descrição | Quem pode |
|--------|-----|-----------|-----------|
| GET | `/api/clinics/<clinic_id>/rooms/` | Lista as salas da clínica | Admin (todas) e profissional (só ativas) |
| POST | `/api/clinics/<clinic_id>/rooms/` | Cria sala | Admin |
| GET | `/api/clinics/<clinic_id>/rooms/<room_id>/` | Detalhe da sala | Usuários da clínica |
| PATCH | `/api/clinics/<clinic_id>/rooms/<room_id>/` | Edita / ativa / desativa | Admin |
| DELETE | `/api/clinics/<clinic_id>/rooms/<room_id>/` | Exclui sala | Admin, só sem consultas vinculadas |

A listagem aceita `?start=&end=` (ISO-8601) e devolve, em cada sala, o campo
derivado `status`: `livre` ou `ocupada`. **Não existe coluna de status no banco** —
a ocupação é calculada pela interseção com as consultas em aberto no intervalo
`[scheduled_at, scheduled_at + duration_minutes)`. Consultas canceladas não
ocupam a sala. Sem `start`/`end`, o intervalo é o instante atual.

A consulta (`Appointment`) ganhou o campo opcional `room` (leitura em
`room_detail`). Pacientes não podem enviá-lo; a sala precisa ser da mesma clínica,
estar ativa no momento da criação e não conflitar com outra consulta — inclusive
quando o profissional for outro.

---

## Endpoints da Fase 1

> **Referência única da API:** a documentação gerada automaticamente a partir do
> código, em `/api/docs/swagger/` (ou `/api/docs/redoc/`; o schema bruto fica em
> `/api/schema/`). Se este README e o Swagger discordarem, vale o Swagger.

### Cadastro de usuários (não existe cadastro público)

Não há rota de autocadastro. **Somente o administrador da clínica cria
usuários.** O sistema envia um convite por e-mail e o convidado define a
própria senha pelo link.

| Método | URL | Descrição | Auth? |
|--------|-----|-----------|-------|
| POST | `/api/auth/admin/users/patients/` | Admin cria paciente e envia convite | Admin |
| POST | `/api/auth/admin/users/professionals/` | Admin cria psicólogo e envia convite | Admin |
| POST | `/api/auth/password/invite/confirm/` | Convidado define a senha (`uid`, `token`, `password`) | Não |

### Autenticação

| Método | URL | Descrição | Auth? |
|--------|-----|-----------|-------|
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

O access token expira em **15 minutos** e é renovado automaticamente pelo
aplicativo. Cada renovação devolve um refresh novo e invalida o anterior.

---

## Para os colegas de frontend

### URL base
```
http://localhost:8000/api/
```

### Autenticação
Todas as rotas (exceto login, renovação de token, recuperação de senha e
confirmação de convite) exigem o header:
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
