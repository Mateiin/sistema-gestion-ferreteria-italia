@echo off
REM Version INSTALADA (usa el npm embebido junto al node.exe -- ver TAREA 1).
cd /d "%~dp0"
echo [%date% %time%] Arrancando backup >> backup-tarea-programada.log
call "%~dp0node\npm.cmd" run backup >> backup-tarea-programada.log 2>&1
echo [%date% %time%] Backup terminado (exit code %errorlevel%) >> backup-tarea-programada.log
