# Registra la tarea programada de backup con dos triggers:
#   1. Diario a las 19:00 (si la PC esta prendida, corre ahi).
#   2. Al inicio del sistema (si estaba apagada a las 19:00, corre cuando se
#      prende al otro dia, con 10 minutos de delay para que el servicio del
#      backend arranque primero).
#
# schtasks de Windows no soporta multiples triggers, por eso se usa
# Register-ScheduledTask (PowerShell 3.0+, disponible en todas las versiones
# modernas de Windows).
#
# Uso (lo llama el instalador Inno Setup):
#   powershell -ExecutionPolicy Bypass -File registrar-tarea-backup.ps1 -TaskName "FerreteriaBackup" -BatPath "C:\Ferreteria\ejecutar-backup.bat"

param(
    [Parameter(Mandatory=$true)]
    [string]$TaskName,

    [Parameter(Mandatory=$true)]
    [string]$BatPath
)

# Eliminar tarea previa si existe (schtasks o PowerShell).
# schtasks /delete funciona para tareas creadas por cualquiera de los dos metodos.
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $BatPath

# Trigger 1: diario a las 19:00.
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At "19:00"

# Trigger 2: al inicio del sistema, con 10 minutos de delay para que el
# servicio NSSM del backend arranque primero y la base de datos este lista.
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$bootTrigger.Delay = "PT10M"   # ISO 8601 duration: 10 minutos

# Configuracion:
#   StartWhenAvailable = true  -> si la PC estaba apagada a las 19:00, ejecuta
#                                  cuando se prenda (complementa el boot trigger).
#   RestartInterval = 1 min    -> si falla, reintenta en 1 minuto.
#   RestartCount = 3           -> maximo 3 reintentos.
#   ExecutionTimeLimit = PT72H -> timeout de 72 horas (no deberia tardar nada,
#                                 pero evita un proceso colgado infinito).
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 3 `
    -ExecutionTimeLimit (New-TimeSpan -Hours 72)

# Ejecutar como SYSTEM (mismo usuario que el servicio NSSM), con privilegios
# elevados (backup necesita acceder a pg_dump y a la carpeta de backups).
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($dailyTrigger, $bootTrigger) `
    -Settings $settings `
    -Principal $principal `
    -Description "Backup diario del Sistema Ferreteria (dump + CSVs). Corre a las 19:00 y tambien al inicio del sistema si la PC estaba apagada." `
    -Force
