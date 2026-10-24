# instalar_tv.ps1 - sincroniza, empacota, instala e abre o launcher na TV LG (webOS Developer Mode).
# Equivalente Windows do install.sh do webos-vibehack. Rode da pasta do projeto.
#
#   .\instalar_tv.ps1 -TvHost 192.168.1.50            # fluxo completo, device "lgtv"
#   .\instalar_tv.ps1 -TvHost 192.168.1.50 -SkipSync  # nao relê a lista de apps da TV
#   .\instalar_tv.ps1 -TvHost 192.168.1.50 -NoLaunch  # instala sem abrir
#   .\instalar_tv.ps1 -TvHost 192.168.1.50 -NoBump    # nao sobe a versao
#
# Se a politica de scripts bloquear: powershell -NoProfile -ExecutionPolicy Bypass -File .\instalar_tv.ps1 ...
# Saida: console + build\instalar_tv.log. Exit code 0 = sucesso.

param(
    [string]$Device = 'lgtv',
    [Parameter(Mandatory = $true)][string]$TvHost,
    [switch]$SkipSync,
    [switch]$NoLaunch,
    [switch]$NoBump
)

$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $proj
$buildDir = Join-Path $proj 'build'
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
$logFile = Join-Path $buildDir 'instalar_tv.log'

function Log($msg) {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

try {
    Log ('INICIO | projeto={0} device={1} tv={2}' -f $proj, $Device, $TvHost)

    # As versoes .cmd do CLI webOS nao passam pela politica de scripts do PowerShell (os .ps1 do npm passam).
    foreach ($exe in @('ares-package.cmd', 'ares-install.cmd', 'ares-launch.cmd')) {
        if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
            throw "$exe nao esta no PATH. Instale com: npm install -g @webos-tools/cli"
        }
    }
    $appinfoPath = Join-Path $proj 'app\appinfo.json'
    if (-not (Test-Path $appinfoPath)) { throw "app\appinfo.json nao encontrado em $proj" }

    # Sobe o patch da versao para distinguir builds na TV. Grava UTF-8 SEM BOM: o webOS recusa BOM
    # e uma conversao ANSI/CP1252 aqui corrompe acentos a cada build (use í no "title").
    $raw = [System.IO.File]::ReadAllText($appinfoPath)
    if ($NoBump) {
        Log 'versao mantida (-NoBump)'
    } elseif ($raw -match '"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"') {
        $nova = '{0}.{1}.{2}' -f $matches[1], $matches[2], ([int]$matches[3] + 1)
        $raw = $raw -replace '"version"\s*:\s*"\d+\.\d+\.\d+"', ('"version": "' + $nova + '"')
        [System.IO.File]::WriteAllText($appinfoPath, $raw, (New-Object System.Text.UTF8Encoding($false)))
        Log "versao -> $nova"
    }

    $appinfo = $raw | ConvertFrom-Json
    $appId = $appinfo.id
    $appVer = $appinfo.version
    if (-not (Test-Path (Join-Path $proj 'app\icon.png'))) {
        Log 'AVISO: app\icon.png ausente. Gere com scripts\make-icon.ps1.'
    }

    if ($SkipSync) {
        Log '1/4 sync-apps PULADO'
    } else {
        Log '1/4 lendo apps e entradas da TV (aceite o pedido de permissao na TV na 1a vez)'
        $py = Join-Path $proj 'venv\Scripts\python.exe'
        if (-not (Test-Path $py)) { $py = 'python' }
        & $py (Join-Path $proj 'sync-apps.py') $TvHost
        if ($LASTEXITCODE -ne 0) { throw "sync-apps.py falhou (exit $LASTEXITCODE)" }
    }

    Log '2/4 empacotando'
    & ares-package.cmd app -o build | ForEach-Object { Log ('  ' + $_) }
    if ($LASTEXITCODE -ne 0) { throw "ares-package falhou (exit $LASTEXITCODE)" }
    $ipk = Get-ChildItem (Join-Path $buildDir "$($appId)_$($appVer)_*.ipk") | Select-Object -First 1
    if (-not $ipk) { throw 'nenhum .ipk gerado em build\' }

    Log "3/4 instalando $($ipk.Name)"
    & ares-install.cmd -d $Device $ipk.FullName | ForEach-Object { Log ('  ' + $_) }
    if ($LASTEXITCODE -ne 0) { throw "ares-install falhou (exit $LASTEXITCODE)" }

    if (-not $NoLaunch) {
        Log '4/4 abrindo na TV'
        & ares-launch.cmd -d $Device $appId | ForEach-Object { Log ('  ' + $_) }
        if ($LASTEXITCODE -ne 0) { throw "ares-launch falhou (exit $LASTEXITCODE)" }
    }

    Log ('FIM OK | {0} {1} instalado{2} na TV' -f $appId, $appVer, $(if ($NoLaunch) { '' } else { ' e aberto' }))
    exit 0
}
catch {
    Log ('FALHOU: ' + $_.Exception.Message)
    exit 1
}
