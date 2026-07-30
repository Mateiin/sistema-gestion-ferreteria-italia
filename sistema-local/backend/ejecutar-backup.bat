@echo off
REM Llama al endpoint REST del backend (POST /api/backup/ejecutar) que es el
REM mismo que usa el boton del frontend. La config (BACKUP_DIR_LOCAL, etc.)
REM se lee de la DB, no del .env. Si el backend no esta corriendo, falla
REM silenciosamente -- la tarea programada reintenta al rato con el boot
REM trigger o StartWhenAvailable.
REM
REM Puerto: 3001 (ver .env, PORT). Si cambia, actualizar aca.
cd /d "%~dp0"
set URL=http://localhost:3001/api/backup/ejecutar
set LOG=backup-tarea-programada.log

echo [%date% %time%] Arrancando backup via API >> %LOG%

REM Preferir curl (Windows 10+ incluye curl.exe). Si no, fallback a PowerShell.
where curl.exe >nul 2>nul
if %errorlevel% equ 0 (
    curl.exe -s -X POST %URL% >> %LOG% 2>&1
) else (
    powershell -Command "try { Invoke-RestMethod -Uri '%URL%' -Method Post -ErrorAction Stop | ConvertTo-Json } catch { Write-Output $_.Exception.Message }" >> %LOG% 2>&1
)

echo [%date% %time%] Backup terminado (exit code %errorlevel%) >> %LOG%
