# Compila el instalador con ISCC y verifica que el .exe resultante no haya
# quedado chico por archivos que Inno omite EN SILENCIO cuando faltan (los
# chequeos de contenido -- vendor/, backend/public/, etc. -- ya viven como
# guard de compilacion dentro de ferreteria.iss, con #error del
# preprocesador; esto de aca es la segunda red, sobre el .exe YA armado, para
# el caso de que algo se cuele igual). Ver docs/INSTALACION.md -- ya paso dos
# veces: un instalador de ~51MB sin postgresql-installer.exe/env.template, y
# despues uno sin backend/public/ (sin frontend, / daba 404).
#
# Uso: correr desde cualquier lado, con o sin ISCC.exe en el PATH:
#   powershell -File sistema-local\installer\compilar-instalador.ps1

$ErrorActionPreference = "Stop"

$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$iss = Join-Path $aqui "ferreteria.iss"
$salida = Join-Path $aqui "Output\FerreteriaSetup.exe"
$tamanoMinimoMB = 350

# ISCC no siempre esta en el PATH (se instala en AppData\Local\Programs o en
# Program Files segun como se haya bajado) -- probamos ubicaciones conocidas
# antes de asumir que hace falta tenerlo en el PATH.
$candidatosIscc = @(
    "ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)
$iscc = $null
foreach ($candidato in $candidatosIscc) {
    $resuelto = Get-Command $candidato -ErrorAction SilentlyContinue
    if ($resuelto) { $iscc = $resuelto.Source; break }
    if (Test-Path $candidato) { $iscc = $candidato; break }
}
if (-not $iscc) {
    Write-Error "No se encontro ISCC.exe (Inno Setup Compiler). Instalarlo desde https://jrsoftware.org/isdl.php."
    exit 1
}

Write-Host "Compilando con $iscc ..."
& $iscc $iss
if ($LASTEXITCODE -ne 0) {
    Write-Error "ISCC fallo (codigo $LASTEXITCODE) -- ver el error de compilacion arriba (puede ser uno de los #error de ferreteria.iss: vendor/, backend/dist/ o backend/public/ faltantes)."
    exit 1
}

if (-not (Test-Path $salida)) {
    Write-Error "ISCC termino con exito pero no aparecio $salida -- revisar OutputDir/OutputBaseFilename en ferreteria.iss."
    exit 1
}

$tamanoMB = (Get-Item $salida).Length / 1MB
if ($tamanoMB -lt $tamanoMinimoMB) {
    Write-Error ("El instalador compilado pesa solo {0:N1} MB (se esperaba mas de {1} MB). " -f $tamanoMB, $tamanoMinimoMB) `
        + "Algo se compilo pero quedo chico -- probablemente [Files] omitio silenciosamente algo con 'skipifsourcedoesntexist' que el guard de #error no cubre. Revisar antes de distribuir este .exe."
    exit 1
}

Write-Host ("OK: {0} ({1:N1} MB)" -f $salida, $tamanoMB)
