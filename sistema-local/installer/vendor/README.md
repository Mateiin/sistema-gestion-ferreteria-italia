# `vendor/` — binarios de terceros que el instalador necesita embeber

Esta carpeta está **vacía en el repo a propósito** (`.gitignore` la excluye
entera menos este README): son binarios de terceros, pesados (decenas a
cientos de MB), que no tiene sentido versionar — se descargan una vez por
quien compila el instalador y quedan acá, en la PC de build, no en git.

Sin estos tres archivos/carpetas, `ferreteria.iss` compila igual (los
`Source:` de `[Files]` tienen `skipifsourcedoesntexist`) pero el instalador
resultante no puede terminar la instalación. Antes de compilar (ver
`docs/INSTALACION.md` → "Cómo se compila el instalador"), conseguir:

**Las versiones EXACTAS usadas la última vez (con checksums) están en
`docs/INSTALACION.md` → "Versiones exactas usadas" — no improvisar una
versión distinta sin actualizar esa tabla, sobre todo la de PostgreSQL (ver
la regla de "misma versión mayor que la PC de desarrollo" ahí mismo).**

## 1. `node/` — runtime de Node.js portable (Windows x64)

Descargar el ZIP (NO el instalador `.msi`) desde
https://nodejs.org/en/download — elegir "Windows Installer (.msi)" **no**,
elegir el link de "Prebuilt Binaries" → `.zip` para Windows x64. Ejemplo de
nombre: `node-v22.x.x-win-x64.zip`.

Descomprimir y copiar el **contenido** de esa carpeta (no la carpeta
contenedora) acá, en `vendor/node/`, de forma que quede:

```
vendor/node/node.exe
vendor/node/npm.cmd
vendor/node/npx.cmd
vendor/node/node_modules/...
```

Usar la misma versión mayor de Node con la que se compiló `backend/dist/`
(ver `node --version` en la PC de desarrollo) — evita sorpresas de
compatibilidad con módulos nativos como `pg`.

## 2. `postgresql-installer.exe` — instalador de PostgreSQL (EDB)

Descargar el instalador de Windows x64 desde
https://www.postgresql.org/download/windows/ (el de EnterpriseDB — soporta
`--mode unattended`, que es justo lo que usa `ferreteria.iss`). Renombrarlo
a `postgresql-installer.exe` y ponerlo directo en `vendor/`.

No hace falta indicarle la versión al script: `ferreteria.iss` encuentra
`psql.exe` después de instalar buscando en
`HKLM\SOFTWARE\PostgreSQL\Installations` (ahí escribe el instalador de EDB
la ruta real, sea cual sea la versión) — funciona igual si Postgres ya
estaba instalado de antes.

## 3. `nssm.exe` — Non-Sucking Service Manager

Descargar desde https://nssm.cc/download (usar el `.zip`, carpeta `win64/`)
y poner `nssm.exe` directo en `vendor/`.

---

Ninguno de estos tres archivos es específico de esta ferretería ni contiene
secretos — son herramientas genéricas de terceros. Lo único que SÍ es
específico (y que el instalador arma en el momento, no lo trae puesto) son
la contraseña de la base y los datos del emisor — ver `ferreteria.iss` y
`plantillas/env.template`.
