@echo off
REM Arranca el sistema (backend + frontend, un solo proceso/puerto).
REM Se ubica solo (cd /d "%~dp0"): funciona sin importar dónde se copió esta
REM carpeta, no hace falta editar rutas acá. Usado por NSSM y por la tarea
REM programada de Task Scheduler — ver docs/INSTALACION.md.
cd /d "%~dp0"
node dist\main.js
