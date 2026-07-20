@echo off
REM Version INSTALADA -- intenta node del PATH, fallback a embebido.
cd /d "%~dp0"
echo [%date% %time%] Arrancando backup >> backup-tarea-programada.log
where node >nul 2>nul
if %errorlevel% equ 0 (
    npm.cmd run backup >> backup-tarea-programada.log 2>&1
) else (
    call "%~dp0node\npm.cmd" run backup >> backup-tarea-programada.log 2>&1
)
echo [%date% %time%] Backup terminado (exit code %errorlevel%) >> backup-tarea-programada.log
