# Projeto Integrador 2026 — Sistema Clínico (ClinicSystem)

Sistema de gestão para clínicas de psicologia. Reúne em um só lugar o
cadastro de pacientes e psicólogos, o agendamento de consultas, os documentos
dos pacientes, o chat entre paciente e psicólogo, as notificações e os
relatórios da clínica.

O sistema é **multiclínica**: cada usuário pertence a uma clínica e só enxerga
os dados dela. Uma clínica nunca acessa consultas, documentos ou pacientes de
outra.

---

## Como testar

O sistema está hospedado. Não é preciso instalar nada: basta abrir no navegador.

### 👉 https://sistemaclinico-ui.vercel.app

> ⏳ **O primeiro login demora — pode levar até 1 minuto.**
> A API roda no plano gratuito do Render, que desliga o servidor quando ninguém
> está usando. No primeiro acesso ele precisa ligar de novo. **Clique em
> "Entrar" uma vez e aguarde**, sem recarregar a página. Se der erro, espere
> alguns segundos e tente de novo. Depois que o servidor liga, o sistema
> responde normalmente.

### Usuários para login

Todos pertencem à **Clínica Demonstração**, que já tem uma psicóloga com
horários livres de segunda a sexta (8h às 18h), duas salas e duas consultas
agendadas.

**Senha de todos: `Demo@Clinica2026`**

| Perfil | E-mail | O que dá para testar |
|--------|--------|----------------------|
| Administrador (secretaria) | `admin@demo.clinicsystem.local` | Cadastrar pacientes e psicólogos, gerenciar usuários e salas, agendar consultas, enviar documentos, relatórios |
| Psicóloga | `psicologa@demo.clinicsystem.local` | Agenda e calendário, disponibilidade, ficha dos pacientes, agendar consultas, relatórios |
| Paciente | `paciente1@demo.clinicsystem.local` | Agendar e acompanhar as próprias consultas, ver a psicóloga responsável, perfil, chat com a psicóloga |
| Paciente | `paciente2@demo.clinicsystem.local` | Mesmo que o anterior (útil para ver que um paciente não enxerga os dados do outro) |

Todos os perfis recebem notificações e podem alterar a senha. **Não existe
cadastro público**: só o administrador da clínica cria contas, e o convidado
recebe um e-mail para definir a própria senha.

> Por segurança, o login aceita poucas tentativas por minuto. Se aparecer um
> aviso de muitas tentativas ao trocar de usuário várias vezes seguidas,
> aguarde 1 minuto.

Documentação da API (Swagger):
https://clinica-api-gnbv.onrender.com/api/docs/swagger/

---

## Tecnologias

| Pasta | O que é | Tecnologias | Hospedagem |
|-------|---------|-------------|------------|
| `Back/` | API REST | Python 3.12, Django 5, Django REST Framework, JWT, PostgreSQL, Channels (chat em tempo real) | Render |
| `web/` | Aplicação web | Expo / React Native Web, expo-router, TypeScript | Vercel |
| `mobile/` | App Android/iOS | Expo / React Native, TypeScript | — |

---

## Sugestão de roteiro para revisar o código

Uma ordem possível de leitura, do geral para o específico. Cada etapa traz
uma ação para fazer no sistema online e ver o código correspondente em
funcionamento. É só uma sugestão: as etapas podem ser lidas em qualquer
ordem.

**1. Visão geral da API**
- `Back/config/urls.py`: o mapa de todos os módulos (`/api/auth/`,
  `/api/appointments/`, `/api/chat/` etc.).
- `Back/config/settings.py`: apps instalados, JWT, CORS e banco.
- Online: abra o [Swagger](https://clinica-api-gnbv.onrender.com/api/docs/swagger/),
  gerado automaticamente a partir desse código.

**2. Usuários, login e perfis** (`Back/apps/accounts/`)
- `models.py`: um único `User` com papel (`patient`, `professional`,
  `admin`) e os perfis `PatientProfile` / `ProfessionalProfile`.
- `serializers.py`, classe `CustomTokenObtainSerializer`: o token JWT já
  leva o papel e a clínica do usuário.
- Online: entre com cada usuário da tabela acima e veja que cada perfil cai
  na sua própria tela inicial.

**3. Isolamento entre clínicas** (o ponto central de segurança)
- `Back/apps/accounts/permissions.py`, funções `is_same_clinic()` e
  `get_object_clinic_id()`: descobrem a clínica de qualquer objeto e
  bloqueiam o acesso de outra clínica.
- `Back/apps/tests_isolamento_clinicas.py`: os testes que garantem isso.

**4. Agendamento de consultas** (a regra de negócio principal)
- `Back/apps/appointments/models.py`: consulta, disponibilidade e nota de
  sessão.
- `Back/apps/appointments/serializers.py`, método `validate()`: horário
  dentro da disponibilidade, conflito de agenda, sala livre e paciente
  sempre com a psicóloga vinculada (`_enforce_assigned_professional`).
- Online: como paciente, agende uma consulta; como psicóloga, veja-a na
  agenda.

**5. Demais módulos do backend** (`Back/apps/`)
- `records/` + `uploads.py`: documentos, com validação do conteúdo real
  do arquivo (`validate_signature`), não só da extensão.
- `chat/consumers.py`: chat em tempo real por WebSocket.
- `notifications/`: notificações disparadas por eventos (`signals.py`).
- `reports/`: relatórios e exportação (`services.py`, `exports.py`).
- `audit/`: registro de auditoria das ações.

**6. Frontend** (`web/`)
- `services/api.ts`: a única porta de comunicação com a API. Vale ver o
  `refreshPromise`, que renova o token uma única vez mesmo com várias
  requisições ao mesmo tempo.
- `app/`: uma pasta por perfil (`(admin)`, `(psychologist)`, `(patient)`,
  `(shared)`). Cada arquivo é uma tela (roteamento do expo-router).
- Boas telas para começar: `app/(auth)/login.tsx`,
  `app/(patient)/agendamento.tsx` e `app/(shared)/chat.tsx`.

**7. Testes**
- Backend: `tests.py` em cada app de `Back/apps/` (198 testes).
- Frontend: `web/services/*.test.ts` (testes unitários) e `web/e2e/`
  (testes ponta a ponta com navegador, Playwright).

---

## Repositórios do projeto

Este é o monorepo com o sistema inteiro. Partes dele também são publicadas em
repositórios próprios:

| Pasta | Também publicada em |
|-------|---------------------|
| `Back/` | [VitorAugusto88/Clinica_sistema](https://github.com/VitorAugusto88/Clinica_sistema) |
| `web/` | [RauniWink7/sistemaclinico-ui](https://github.com/RauniWink7/sistemaclinico-ui) e [VitorAugusto88/sistemaclinico-ui](https://github.com/VitorAugusto88/sistemaclinico-ui) |
| `mobile/` | — (só neste repositório) |

### Enviando atualizações para todos os repositórios

Na raiz do projeto:

```powershell
.\sincronizar.ps1 -Mensagem "descrição da mudança"
# ou
git sincronizar -Mensagem "descrição da mudança"
```

O comando commita o que estiver pendente e envia:

1. o monorepo inteiro para este repositório;
2. a pasta `Back/` para `Clinica_sistema`;
3. a pasta `web/` para os dois `sistemaclinico-ui`.

Sem `-Mensagem`, ele só envia o que já foi commitado. Nunca usa `--force`: se
alguém mandou commits direto para um dos repositórios, aquele envio é recusado
e o script mostra o comando (`git subtree pull ...`) para trazer as mudanças
antes de tentar de novo.

> O alias `git sincronizar` é configuração local do git. Num clone novo, recrie com:
> `git config alias.sincronizar '!powershell -NoProfile -ExecutionPolicy Bypass -File sincronizar.ps1'`
> (o `.\sincronizar.ps1` funciona sempre e recria os remotos que faltarem).
