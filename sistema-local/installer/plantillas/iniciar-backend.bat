@echo off
REM Version INSTALADA -- intenta usar node del PATH (lo instala el propio
REM instalador si no estaba). Fallback a node embebido por si existe.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
    node "%~dp0dist\main.js"
) else (
    "%~dp0node\node.exe" "%~dp0dist\main.js"
)
