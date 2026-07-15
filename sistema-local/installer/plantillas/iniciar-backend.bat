@echo off
REM Version INSTALADA (usa el node.exe embebido, no exige Node en el
REM sistema -- ver TAREA 1). La version del repo, para instalacion manual
REM (docs/INSTALACION.md, anexo), usa el "node" del PATH del sistema en vez
REM de esta ruta relativa.
cd /d "%~dp0"
"%~dp0node\node.exe" "%~dp0dist\main.js"
