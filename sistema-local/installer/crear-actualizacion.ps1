# Arma el paquete de actualizacion (ActualizacionFerreteria.zip) para la PC del
# local. A diferencia del instalador completo (FerreteriaSetup.exe, ~400MB),
# este zip solo lleva la capa de codigo que de verdad cambia entre versiones:
#   - dist/   (backend compilado, ~0,3 MB)
#   - public/ (frontend build, ~0,4 MB)
#   - las plantillas/.bat/.ps1 que el instalador copia a C:\Ferreteria
#   - scripts/backup.ts (lo usa la tarea programada del backup)
# NO lleva node_modules (200MB), ni Node embebido, ni Postgres, ni NSSM.
#
# Si una actualizacion agrega dependencias nuevas (cambio de package.json que
# requiera npm install), este zip NO alcanza: usar el instalador completo
# (compilar-instalador.ps1), que si lleva node_modules.
#
# En la PC del local el zip se aplica arrastrandolo sobre
# C:\Ferreteria\aplicar-actualizacion.bat, que copia SOLO los archivos que
# difieren de lo instalado (compara SHA-256 contra este MANIFEST.json).
#
# Uso (despues de correr 'npm run build:prod' en sistema-local\backend):
#   powershell -File sistema-local\installer\crear-actualizacion.ps1
# El resultado queda en sistema-local\installer\Output\ActualizacionFerreteria.zip

$ErrorActionPreference = "Stop"

$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $aqui
$backend = Join-Path $root "backend"

# Mismo guard que ferreteria.iss: sin el build no hay actualizacion que sirva.
if (-not (Test-Path (Join-Path $backend "dist\main.js"))) {
    Write-Error "Falta backend\dist\main.js -- correr 'npm run build:prod' en sistema-local\backend\ antes (ver docs\INSTALACION.md)."
    exit 1
}
if (-not (Test-Path (Join-Path $backend "public\index.html"))) {
    Write-Error "Falta backend\public\index.html -- 'npm run build:prod' no corrio o corrio mal (el paquete quedaria SIN FRONTEND)."
    exit 1
}

$staging = Join-Path $env:TEMP ("ferreteria-actualizacion-staging-" + [Guid]::NewGuid().ToString("N"))
$salida = Join-Path $aqui "Output\ActualizacionFerreteria.zip"

# Copia un archivo opcional al staging manteniendo la ruta relativa (espejo de
# C:\Ferreteria). Si el origen no existe, se saltea en silencio (son opcionales).
function AgregarArchivo($rutaOrigen, $relDestino) {
    if (-not (Test-Path $rutaOrigen)) { return }
    $destino = Join-Path $staging ($relDestino -replace "/", "\")
    $dir = Split-Path -Parent $destino
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Path $rutaOrigen -Destination $destino -Force
}

try {
    New-Item -ItemType Directory -Path $staging -Force | Out-Null

    # Capa de codigo: el 99,9% de las actualizaciones.
    New-Item -ItemType Directory -Path (Join-Path $staging "dist") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $staging "public") -Force | Out-Null
    Copy-Item -Path (Join-Path $backend "dist\*") -Destination (Join-Path $staging "dist") -Recurse -Force
    Copy-Item -Path (Join-Path $backend "public\*") -Destination (Join-Path $staging "public") -Recurse -Force

    AgregarArchivo (Join-Path $backend "package.json") "package.json"
    AgregarArchivo (Join-Path $backend "scripts\backup.ts") "scripts/backup.ts"
    AgregarArchivo (Join-Path $backend "scripts\README-backup.md") "scripts/README-backup.md"
    AgregarArchivo (Join-Path $backend "scripts\verificar-produccion.ts") "scripts/verificar-produccion.ts"
    AgregarArchivo (Join-Path $backend ".env.produccion.example") ".env.produccion.example"

    # Plantillas que el instalador copia a {app} o {app}\_instalador.
    AgregarArchivo (Join-Path $aqui "plantillas\ejecutar-backup.bat") "ejecutar-backup.bat"
    AgregarArchivo (Join-Path $aqui "plantillas\iniciar-backend.bat") "iniciar-backend.bat"
    AgregarArchivo (Join-Path $aqui "plantillas\certs-leeme.txt") "certs/LEEME.txt"
    AgregarArchivo (Join-Path $aqui "plantillas\registrar-tarea-backup.ps1") "_instalador/registrar-tarea-backup.ps1"
    AgregarArchivo (Join-Path $aqui "plantillas\aplicar-actualizacion.ps1") "_instalador/aplicar-actualizacion.ps1"
    AgregarArchivo (Join-Path $aqui "abrir-ferreteria.vbs") "abrir-ferreteria.vbs"
    AgregarArchivo (Join-Path $aqui "app.ico") "app.ico"
    AgregarArchivo (Join-Path $aqui "assets\logo-ferreteria.png") "certs/logo-ferreteria.png"
    # aplicar-actualizacion.bat NO se incluye a proposito: el .bat que esta
    # corriendo no puede reemplazarse a si mismo con seguridad (cmd lo lee por
    # lineas). Si el .bat cambia, se entrega con el instalador completo.

    # MANIFEST.json: ruta relativa + sha256 + tamano por archivo. Con el lo
    # que sea (el .bat instalado) sabe que copiar y que no, sin comparar
    # contenido contra la PC del local (no hay conexion entre las dos).
    $archivos = @()
    Get-ChildItem -Path $staging -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($staging.Length + 1) -replace "\\", "/"
        $archivos += [pscustomobject]@{
            ruta    = $rel
            sha256  = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash
            tamanio = $_.Length
        }
    }
    $manifest = [pscustomobject]@{
        creado     = (Get-Date -Format "yyyy-MM-dd HH:mm")
        version    = (Get-Date -Format "yyyy.MM.dd.HHmm")
        comentario = "Actualizacion del Sistema Ferreteria (capa de codigo, sin node_modules)."
        archivos   = $archivos
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $staging "MANIFEST.json") -Encoding UTF8

    $dirSalida = Join-Path $aqui "Output"
    if (-not (Test-Path $dirSalida)) { New-Item -ItemType Directory -Path $dirSalida -Force | Out-Null }
    if (Test-Path $salida) { Remove-Item $salida -Force }

    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $salida -CompressionLevel Optimal

    $tamanoKB = (Get-Item $salida).Length / 1KB
    Write-Host ("OK: {0} ({1:N0} KB, {2} archivos)" -f $salida, $tamanoKB, $archivos.Count)
    Write-Host "En la PC del local: arrastrar este zip sobre C:\Ferreteria\aplicar-actualizacion.bat"
}
finally {
    Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
}
