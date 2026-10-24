# apply-template.ps1 - copia o template desta skill por cima de um clone do webos-vibehack
# e aplica as correcoes de Windows/webOS 5. Nao apaga nada do clone.
#
#   git clone https://github.com/OmkarK97/webos-vibehack.git
#   .\scripts\apply-template.ps1 -Target .\webos-vibehack

param([Parameter(Mandatory = $true)][string]$Target)

$ErrorActionPreference = 'Stop'
$skill = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tpl = Join-Path $skill 'template'
$dst = (Resolve-Path $Target).Path
if (-not (Test-Path (Join-Path $dst 'sync-apps.py'))) { throw "$dst nao parece um clone do webos-vibehack" }

foreach ($f in 'app.js', 'style.css', 'index.html', 'config.js') {
    Copy-Item (Join-Path $tpl "app\$f") (Join-Path $dst "app\$f") -Force
}
foreach ($f in 'tv_services.py', 'home-watch.py', 'instalar_tv.ps1', 'tv_services.example.json') {
    Copy-Item (Join-Path $tpl $f) (Join-Path $dst $f) -Force
}

$utf8 = New-Object System.Text.UTF8Encoding($false)

# sync-apps.py grava apps.js sem encoding explicito: no Windows sai em CP1252 e "Vídeos" vira "V?deos".
$sync = Join-Path $dst 'sync-apps.py'
$s = [System.IO.File]::ReadAllText($sync)
if ($s -notmatch 'apps\.js"\), "w", encoding="utf-8"') {
    $s = $s.Replace('"apps.js"), "w")', '"apps.js"), "w", encoding="utf-8")')
    [System.IO.File]::WriteAllText($sync, $s, $utf8)
    Write-Host 'sync-apps.py: apps.js agora em UTF-8'
}

# appinfo.json: titulo em portugues com escape ASCII (sobrevive a qualquer regravacao) e fundo do tema.
$ai = Join-Path $dst 'app\appinfo.json'
$a = [System.IO.File]::ReadAllText($ai)
$a = $a -replace '"title"\s*:\s*"[^"]*"', '"title": "Início"'
$a = $a -replace '"bgColor"\s*:\s*"[^"]*"', '"bgColor": "#021a0c"'
[System.IO.File]::WriteAllText($ai, $a, $utf8)

& (Join-Path $skill 'scripts\make-icon.ps1') -AppDir (Join-Path $dst 'app')
Write-Host "Template aplicado em $dst. Edite app\config.js e rode .\instalar_tv.ps1 -TvHost <IP da TV>"
