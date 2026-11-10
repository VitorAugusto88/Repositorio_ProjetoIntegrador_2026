# Projeto Integrador 2026 — Sistema Clínico

Monorepo com todo o sistema da clínica.

| Pasta     | O que é                                  | Também publicado em |
|-----------|------------------------------------------|---------------------|
| `Back/`   | API em Django 5 + Django REST Framework  | [Clinica_sistema](https://github.com/VitorAugusto88/Clinica_sistema) |
| `web/`    | Frontend web (Expo / React Native Web)   | [RauniWink7/sistemaclinico-ui](https://github.com/RauniWink7/sistemaclinico-ui) e [VitorAugusto88/sistemaclinico-ui](https://github.com/VitorAugusto88/sistemaclinico-ui) |
| `mobile/` | App mobile Android/iOS (Expo)            | — (só neste repositório) |

`web/` e `mobile/` nasceram do mesmo projeto Expo e agora evoluem separadamente:
uma correção feita em um **não** vai para o outro sozinha.

## Como rodar

```powershell
# Backend
cd Back
venv\Scripts\activate
python manage.py runserver        # http://localhost:8000

# Web
cd web
npm install
npm run web

# Mobile
cd mobile
npm install
npx expo start                    # a = Android, i = iOS
```

Detalhes de cada projeto ficam no README dentro da pasta.

## Enviando atualizações para todos os repositórios

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

Sem `-Mensagem`, ele só envia o que já foi commitado. Nunca usa `--force`: se alguém
mandou commits direto para um dos repositórios, aquele envio é recusado e o script
mostra o comando (`git subtree pull ...`) para trazer as mudanças antes de tentar de novo.

> O alias `git sincronizar` é configuração local do git. Num clone novo, recrie com:
> `git config alias.sincronizar '!powershell -NoProfile -ExecutionPolicy Bypass -File sincronizar.ps1'`
> (o `.\sincronizar.ps1` funciona sempre e recria os remotos que faltarem).
