@echo off
REM Corre el backup diario (scripts/backup.ts) y deja un registro propio de
REM CUÁNDO corrió esta tarea (separado de backup.log, que lo escribe el
REM script con el detalle). Pensado para la tarea programada de Windows —
REM ver docs/INSTALACION.md, paso 7.
cd /d "%~dp0"
echo [%date% %time%] Arrancando backup >> backup-tarea-programada.log
call npm run backup >> backup-tarea-programada.log 2>&1
echo [%date% %time%] Backup terminado (exit code %errorlevel%) >> backup-tarea-programada.log
