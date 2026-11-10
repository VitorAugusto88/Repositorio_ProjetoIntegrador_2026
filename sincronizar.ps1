<#
.SYNOPSIS
    Envia as atualizações do monorepo para TODOS os repositórios do projeto.

.DESCRIPTION
    Este monorepo junta três projetos:
        Back/    -> backend Django   (também publicado em Clinica_sistema)
        web/     -> frontend Expo    (também publicado nos dois sistemaclinico-ui)
        mobile/  -> app mobile Expo  (só existe neste monorepo)

    O script:
      1. (opcional) commita as alterações pendentes, se receber -Mensagem;
      2. dá push do monorepo inteiro em origin (Repositorio_ProjetoIntegrador_2026);
      3. extrai o histórico de Back/ (git subtree split) e dá push em Clinica_sistema;
      4. extrai o histórico de web/ e dá push nos dois sistemaclinico-ui
         (RauniWink7 e VitorAugusto88).

    Nunca usa --force: se alguém tiver mandado commits direto para um dos
    repositórios, o push daquele repositório é recusado e o script mostra o
    comando para trazer essas mudanças antes de tentar de novo.

.EXAMPLE
    .\sincronizar.ps1 -Mensagem "Corrige a tela de agendamento"
    git sincronizar -Mensagem "Corrige a tela de agendamento"
    .\sincronizar.ps1          # só envia o que já está commitado
#>
param(
    [string]$Mensagem
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$branch = 'main'

# remoto => URL. Recriados automaticamente se faltarem (ex.: num clone novo).
$remotos = [ordered]@{
    'origin'     = 'https://github.com/VitorAugusto88/Repositorio_ProjetoIntegrador_2026.git'
    'back'       = 'https://github.com/VitorAugusto88/Clinica_sistema.git'
    'web-origin' = 'https://github.com/RauniWink7/sistemaclinico-ui.git'
    'web-fork'   = 'https://github.com/VitorAugusto88/sistemaclinico-ui.git'
}

# pasta do monorepo => remotos que recebem só aquela pasta
$subprojetos = [ordered]@{
    'Back' = @('back')
    'web'  = @('web-origin', 'web-fork')
}

function Escrever-Etapa($texto) {
    Write-Host ''
    Write-Host "==> $texto" -ForegroundColor Cyan
}

# --- 0. Remotos -------------------------------------------------------------
$existentes = @(git remote)
foreach ($nome in $remotos.Keys) {
    if ($existentes -notcontains $nome) {
        git remote add $nome $remotos[$nome]
        Write-Host "Remoto '$nome' adicionado."
    }
}

$atual = (git rev-parse --abbrev-ref HEAD).Trim()
if ($atual -ne $branch) {
    Write-Host "Você está na branch '$atual'. Troque para '$branch' antes de sincronizar." -ForegroundColor Red
    exit 1
}

# --- 1. Commit das pendências -----------------------------------------------
$pendencias = git status --porcelain
if ($pendencias) {
    if ($Mensagem) {
        Escrever-Etapa 'Commitando alterações pendentes'
        git add -A
        git commit -m $Mensagem
        if ($LASTEXITCODE -ne 0) { Write-Host 'O commit falhou.' -ForegroundColor Red; exit 1 }
    }
    else {
        Write-Host ''
        Write-Host 'Há alterações NÃO commitadas — elas não serão enviadas.' -ForegroundColor Yellow
        Write-Host 'Para incluí-las: .\sincronizar.ps1 -Mensagem "descrição da mudança"' -ForegroundColor Yellow
    }
}

$falhas = @()

function Enviar($remoto, $origem) {
    git push $remoto "${origem}:refs/heads/$branch"
    if ($LASTEXITCODE -ne 0) { $script:falhas += $remoto }
}

# --- 2. Monorepo ------------------------------------------------------------
Escrever-Etapa "Monorepo -> origin ($($remotos['origin']))"
Enviar 'origin' $branch

# --- 3. Subprojetos ---------------------------------------------------------
foreach ($pasta in $subprojetos.Keys) {
    Escrever-Etapa "Extraindo o histórico de $pasta/"
    $commit = git subtree split --prefix=$pasta $branch | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0 -or -not $commit) {
        Write-Host "Não foi possível extrair $pasta/." -ForegroundColor Red
        $falhas += $subprojetos[$pasta]
        continue
    }
    foreach ($remoto in $subprojetos[$pasta]) {
        Escrever-Etapa "$pasta/ -> $remoto ($($remotos[$remoto]))"
        Enviar $remoto $commit.Trim()
    }
}

# --- Resumo -----------------------------------------------------------------
Write-Host ''
if ($falhas.Count -eq 0) {
    Write-Host 'Tudo sincronizado: monorepo, Clinica_sistema e os dois sistemaclinico-ui.' -ForegroundColor Green
    exit 0
}

Write-Host "Falhou em: $($falhas -join ', ')" -ForegroundColor Red
Write-Host 'Se o push foi recusado porque o repositório tem commits novos de outra pessoa,'
Write-Host 'traga essas mudanças para o monorepo e rode o script de novo:'
foreach ($remoto in $falhas) {
    if ($remoto -eq 'origin') {
        Write-Host "    git pull origin $branch"
        continue
    }
    $pasta = ($subprojetos.Keys | Where-Object { $subprojetos[$_] -contains $remoto }) | Select-Object -First 1
    Write-Host "    git subtree pull --prefix=$pasta $remoto $branch"
}
exit 1
