@echo off
REM Llama al endpoint REST del backend (POST /api/backup/ejecutar) que es el
REM mismo que usa el boton del frontend. La config (BACKUP_DIR_LOCAL, etc.)
REM se lee de la DB, no del .env. Si el backend no esta corriendo, falla
REM silenciosamente -- la tarea programada reintenta al rato con el boot
REM trigger o StartWhenAvailable.
REM
REM Puerto se lee del .env (misma carpeta). Fallback a 3000 si no se
REM especifico o si ese puerto no responde.
cd /d "%~dp0"
set LOG=backup-tarea-programada.log

for /f "tokens=2 delims==" %%i in ('findstr /b "PORT=" .env 2^>nul') do set PORT=%%i
if "%PORT%"=="" set PORT=3000

echo [%date% %time%] Arrancando backup via API (puerto %PORT%) >> %LOG%

REM Primero intenta con el puerto del .env. Si no responde, fallback a 3000.
powershell -NoProfile -File "%~dp0ejecutar-backup.ps1" -Url "http://localhost:%PORT%/api/backup/ejecutar" >> %LOG% 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] Puerto %PORT% no responde, probando 3000... >> %LOG%
    powershell -NoProfile -File "%~dp0ejecutar-backup.ps1" -Url "http://localhost:3000/api/backup/ejecutar" >> %LOG% 2>&1
)

echo [%date% %time%] Backup terminado >> %LOG%
