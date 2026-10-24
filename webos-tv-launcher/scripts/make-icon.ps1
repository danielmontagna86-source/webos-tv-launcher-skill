# make-icon.ps1 - gera app\icon.png (80px) e app\largeIcon.png (130px): casinha branca sobre
# um quadrado arredondado em degrade. So usa o System.Drawing do Windows, nada para instalar.
#
#   .\scripts\make-icon.ps1 -AppDir .\app                       # verde (padrao)
#   .\scripts\make-icon.ps1 -AppDir .\app -Top '#1565C0' -Bottom '#0D2A5C'   # azul

param(
    [string]$AppDir = '.\app',
    [string]$Top = '#127C42',
    [string]$Bottom = '#033016'
)

Add-Type -AssemblyName System.Drawing

function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function Make-Icon([int]$s, [string]$out) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $r = [int]($s * 0.22)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $p.AddArc($s - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $p.AddArc($s - 2 * $r, $s - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $p.AddArc(0, $s - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $p.CloseFigure()
    $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $s, $s), (Color $Top), (Color $Bottom)
    $g.FillPath($br, $p)
    $w = [System.Drawing.Brushes]::White
    $u = $s / 100.0
    $roof = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF (50 * $u), (22 * $u)),
        (New-Object System.Drawing.PointF (80 * $u), (48 * $u)),
        (New-Object System.Drawing.PointF (20 * $u), (48 * $u)))
    $g.FillPolygon($w, $roof)
    $g.FillRectangle($w, 28 * $u, 46 * $u, 44 * $u, 32 * $u)
    $door = New-Object System.Drawing.SolidBrush (Color $Bottom)
    $g.FillRectangle($door, 44 * $u, 58 * $u, 12 * $u, 20 * $u)
    $g.Dispose()
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$dir = (Resolve-Path $AppDir).Path
Make-Icon 80 (Join-Path $dir 'icon.png')
Make-Icon 130 (Join-Path $dir 'largeIcon.png')
Write-Host "icon.png e largeIcon.png gerados em $dir"
