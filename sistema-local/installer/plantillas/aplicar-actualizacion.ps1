# Aplica una actualizacion del Sistema Ferreteria en la PC del local.
#
# El paquete (ActualizacionFerreteria.zip) lo arma crear-actualizacion.ps1 en
# la PC de desarrollo: solo lleva la capa de codigo (dist/, public/ y las
# plantillas/.bat), NO node_modules ni Node ni Postgres. Este script extrae el
# zip y copia a {AppDir} SOLO los archivos que difieren de lo instalado
# (compara SHA-256 contra el MANIFEST.json que viene adentro del paquete),
# frenando y levantando el servicio del backend alrededor.
#
# Uso (lo llama aplicar-actualizacion.bat, que soporta arrastrar el zip):
#   powershell -NoProfile -ExecutionPolicy Bypass -File aplicar-actualizacion.ps1 -Zip "C:\...\ActualizacionFerreteria.zip"
#
# Parametros extra, solo para pruebas fuera de la PC del local:
#   -AppDir "C:\Ferreteria"   directorio de la aplicacion (default: C:\Ferreteria)
#   -NoService                no toca el servicio NSSM (pruebas)

param(
    [Parameter(Mandatory = $true)]
    [string]$Zip,

    [string]$AppDir = "C:\Ferreteria",

    [switch]$NoService
)

$ErrorActionPreference = "Stop"

$ServiceName = "FerreteriaBackend"
$Nssm = Join-Path $AppDir "_instalador\nssm.exe"
$Log = Join-Path $AppDir "actualizaciones.log"

function EscribirLog($mensaje) {
    $linea = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $mensaje
    Write-Host $linea
    Add-Content -Path $Log -Value $linea
}

if (-not (Test-Path $Zip)) {
    Write-Host "ERROR: no se encontro el archivo de actualizacion: $Zip"
    exit 1
}

$tmp = Join-Path $env:TEMP ("ferreteria-actualizacion-" + [Guid]::NewGuid().ToString("N"))
try {
    Expand-Archive -Path $Zip -DestinationPath $tmp -Force

    $manifestPath = Join-Path $tmp "MANIFEST.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Host "ERROR: el zip no contiene MANIFEST.json -- no es un paquete de actualizacion valido."
        exit 1
    }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

    if (-not (Test-Path $AppDir)) {
        Write-Host "ERROR: no existe $AppDir -- el aplicador corre en la PC con el sistema instalado (C:\Ferreteria)."
        exit 1
    }

    EscribirLog "Aplicando actualizacion ($($manifest.creado)) a $AppDir"
    EscribirLog "Version: $($manifest.version) -- $($manifest.comentario)"

    # 1) Frenar el servicio (si existe y no es una prueba).
    if (-not $NoService) {
        if (Test-Path $Nssm) {
            & $Nssm stop $ServiceName | Out-Null
            EscribirLog "Servicio $ServiceName detenido."
        } else {
            EscribirLog "AVISO: no se encontro $Nssm -- no se frena el servicio (los archivos nuevos se copian igual)."
        }
    }

    # 2) Copiar solo lo que cambio (por hash), respetando la estructura del
    #    manifest (rutas con /, se convierten a \ para el filesystem).
    $nuevos = 0
    $actualizados = 0
    $sinCambios = 0
    $errores = @()
    $cambioTareaBackup = $false

    foreach ($item in $manifest.archivos) {
        $rel = $item.ruta
        if ($rel -eq "aplicar-actualizacion.bat") {
            EscribirLog "AVISO: $rel es el .bat que esta corriendo -- se saltea (el nuevo se aplica en la proxima corrida)."
            continue
        }

        $src = Join-Path $tmp ($rel -replace "/", "\")
        $dst = Join-Path $AppDir ($rel -replace "/", "\")
        if (-not (Test-Path $src)) {
            EscribirLog "ERROR: falta $rel dentro del paquete."
            $errores += $rel
            continue
        }

        $existe = Test-Path $dst
        if ($existe) {
            $hashDst = (Get-FileHash -Path $dst -Algorithm SHA256).Hash
            if ($hashDst -eq $item.sha256) {
                $sinCambios++
                continue
            }
        }

        try {
            $dirDst = Split-Path -Parent $dst
            if (-not (Test-Path $dirDst)) {
                New-Item -ItemType Directory -Path $dirDst -Force | Out-Null
            }
            Copy-Item -Path $src -Destination $dst -Force
            if ($existe) {
                $actualizados++
                EscribirLog "Actualizado: $rel"
            } else {
                $nuevos++
                EscribirLog "Nuevo: $rel"
            }
            if ($rel -eq "_instalador/registrar-tarea-backup.ps1") {
                $cambioTareaBackup = $true
            }
        } catch {
            EscribirLog "ERROR copiando $rel : $($_.Exception.Message)"
            $errores += $rel
        }
    }

    EscribirLog "Resumen: $nuevos nuevo(s), $actualizados actualizado(s), $sinCambios sin cambios (saltados)."

    # 3) Si se actualizo registrar-tarea-backup.ps1, re-registrar la tarea
    #    programada del backup (misma llamada que hace el instalador). Solo si
    #    la config de la tarea puede haber cambiado, no en cada actualizacion.
    if ($cambioTareaBackup) {
        $ps1 = Join-Path $AppDir "_instalador\registrar-tarea-backup.ps1"
        $bat = Join-Path $AppDir "ejecutar-backup.bat"
        if ((Test-Path $ps1) -and (Test-Path $bat)) {
            EscribirLog "Cambio registrar-tarea-backup.ps1 -- re-registrando la tarea del backup..."
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -TaskName "FerreteriaBackup" -BatPath $bat
            if ($LASTEXITCODE -ne 0) {
                EscribirLog "AVISO: no se pudo re-registrar la tarea del backup (codigo $LASTEXITCODE) -- registrarla a mano (docs\INSTALACION.md)."
            } else {
                EscribirLog "Tarea del backup re-registrada."
            }
        }
    }

    # 4) Levantar el servicio.
    if (-not $NoService) {
        if (Test-Path $Nssm) {
            & $Nssm start $ServiceName | Out-Null
            EscribirLog "Servicio $ServiceName levantado."
        }
    }

    if ($errores.Count -gt 0) {
        EscribirLog "ERROR: $($errores.Count) archivo(s) no se pudieron copiar: $($errores -join ', ')"
        exit 1
    }

    EscribirLog "Actualizacion aplicada OK."
    exit 0
}
finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
