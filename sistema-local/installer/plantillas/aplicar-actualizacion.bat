@echo off
REM Aplicador de actualizaciones del Sistema Ferreteria.
REM Uso: arrastrar ActualizacionFerreteria.zip encima de este .bat, o pasar la
REM ruta como argumento. Copia a C:\Ferreteria solo los archivos que cambiaron
REM (compara SHA-256), frenando y levantando el servicio del backend.

setlocal
set "ZIP=%~1"

if "%ZIP%"=="" (
    echo.
    echo Arrastra el archivo ActualizacionFerreteria.zip encima de este .bat
    echo ^(o pasale la ruta: aplicar-actualizacion.bat "C:\ruta\ActualizacionFerreteria.zip"^).
    echo.
    pause
    exit /b 1
)

if not exist "%ZIP%" (
    echo ERROR: no se encontro el archivo: %ZIP%
    pause
    exit /b 1
)

REM El sistema vive en C:\Ferreteria y un usuario comun no puede escribir ahi
REM (ni manejar el servicio) -- pedir elevacion igual que el instalador.
>nul 2>&1 net session
if %errorlevel% neq 0 (
    echo Solicitando permisos de administrador...
    >"%temp%\ferreteria-uac.vbs" echo set s=CreateObject("Shell.Application"^)
    >>"%temp%\ferreteria-uac.vbs" echo s.ShellExecute "%~f0", "%ZIP%", "", "runas", 1
    "%temp%\ferreteria-uac.vbs"
    del "%temp%\ferreteria-uac.vbs" >nul 2>&1
    exit /b
)

set "PS1=%~dp0_instalador\aplicar-actualizacion.ps1"
if not exist "%PS1%" (
    echo ERROR: no se encontro %PS1%
    echo Este aplicador se instala junto con FerreteriaSetup.exe.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Zip "%ZIP%"
set "EXIT=%errorlevel%"

if %EXIT% neq 0 (
    echo.
    echo La actualizacion FALLO ^(exit %EXIT%^). Detalle en C:\Ferreteria\actualizaciones.log
) else (
    echo.
    echo Actualizacion aplicada correctamente.
)
pause
exit /b %EXIT%
