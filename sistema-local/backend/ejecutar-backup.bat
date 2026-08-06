@echo off
REM Version DEV (desde el repo) -- corre el backup STANDALONE directo contra
REM PostgreSQL (scripts/backup.ts con tsx), sin pasar por el backend. En la PC
REM del local la copia INSTALADA de este mismo archivo vive en
REM installer\plantillas\ejecutar-backup.bat (usa el Node embebido de
REM C:\Ferreteria\node\; esta version cae al node del PATH). Ver
REM scripts\backup.ts.
REM
REM Sale con exit code != 0 si el dump o los CSVs fallan, para que la tarea
REM programada reintente y el fallo quede registrado.
cd /d "%~dp0"
set LOG=backup-tarea-programada.log

REM Node embebido de la instalacion (C:\Ferreteria\node\node.exe). Si no esta
REM (por ejemplo, corriendo el .bat desde el repo en dev), cae al node del PATH.
set NODE_EXE=%CD%\node\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

if not exist "%CD%\scripts\backup.ts" (
    echo [%date% %time%] ERROR: no se encontro scripts\backup.ts en %CD% >> %LOG%
    exit /b 1
)
if not exist "%CD%\node_modules\tsx\dist\cli.mjs" (
    echo [%date% %time%] ERROR: falta node_modules\tsx\dist\cli.mjs en %CD% >> %LOG%
    exit /b 1
)

echo [%date% %time%] Arrancando backup standalone >> %LOG%
"%NODE_EXE%" "%CD%\node_modules\tsx\dist\cli.mjs" "%CD%\scripts\backup.ts" >> %LOG% 2>&1
set EXIT=%errorlevel%
if %EXIT% neq 0 (
    echo [%date% %time%] Backup FALLO (exit code %EXIT%). Detalle en backup.log y en este archivo >> %LOG%
) else (
    echo [%date% %time%] Backup OK >> %LOG%
)
exit /b %EXIT%
