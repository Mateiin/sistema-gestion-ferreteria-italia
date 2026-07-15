# Instalación en la PC del local (Windows)

Cubre la **Fase 2** del despliegue (instalación nativa, sin Docker — ver
`CLAUDE.md` → "Despliegue"). **No incluye** el salto a ARCA producción (eso
es la Fase 3, aparte): en esta instalación el sistema sigue trabajando
contra homologación hasta que ese paso se haga a mano y a conciencia.

Nada de esto necesita Docker: Postgres corre como servicio nativo de
Windows y el backend (que también sirve el frontend, un solo proceso/puerto)
corre como servicio de Windows (NSSM), también nativo.

**Camino principal: el instalador `.exe`** (`FerreteriaSetup.exe`, ver
sección 1 de abajo) hace todo esto solo, de un doble clic. El **Anexo — Paso
a paso manual** al final de este documento queda como respaldo, por si el
instalador falla en algún paso o hace falta entender/corregir algo a mano.

---

## 1. Instalación con el instalador (camino principal)

### 0. Qué vas a necesitar antes de empezar

- La PC del local, con Windows, conectada a internet (solo durante la
  instalación — en uso normal el sistema no necesita internet, salvo para
  facturar contra ARCA).
- Permisos de administrador en esa PC (el instalador los pide con UAC al
  arrancar — instala PostgreSQL, un servicio de Windows y una tarea
  programada, todo eso necesita admin).
- `FerreteriaSetup.exe` (ver "Cómo se compila el instalador" más abajo —
  se arma una vez, en la PC de desarrollo, y se copia a la PC del local por
  pendrive o como sea más cómodo).
- Los datos del emisor a mano (razón social, CUIT de homologación,
  domicilio, Ingresos Brutos, inicio de actividades, punto de venta) — el
  instalador los pide durante el wizard.
- Si ya existe una instalación de PostgreSQL en esa PC: la contraseña del
  superusuario (`postgres`) — el instalador también la pide, solo en ese
  caso.

### Qué hace el instalador, solo

1. Detecta si PostgreSQL ya está instalado. Si no, lo instala desatendido
   (nadie tiene que clickear nada en esa parte).
2. Crea un usuario y una base de datos PROPIOS de la app (`ferreteria_app`
   / `ferreteria_local`), con una contraseña ALEATORIA generada en el
   momento — nunca hay una contraseña fija adentro del `.exe`.
3. Copia la aplicación a `C:\Ferreteria` — backend compilado + frontend +
   **Node.js embebido** (no hace falta instalar Node aparte en la PC del
   local, viene adentro).
4. Genera el `.env` con esa contraseña + los datos del emisor que pediste
   en el paso anterior. ARCA queda en homologación — el salto a producción
   es aparte, a mano (ver `CLAUDE.md` → "Despliegue" → Fase 3).
5. Registra el backend como **servicio de Windows** (NSSM): arranque
   automático al prender la PC, sin que nadie tenga que iniciar sesión, y
   se reinicia solo si se cae.
6. Crea la **tarea programada** del backup nocturno (todas las noches a las
   23:30).
7. Crea el **acceso directo del escritorio** — abre el sistema en modo
   ventana de aplicación (sin barra de direcciones), esperando unos
   segundos si el servicio recién está arrancando.

### Paso manual OBLIGATORIO después de instalar: certificados de ARCA

El instalador **a propósito** no trae ni pide los certificados de ARCA (ver
"Por qué el instalador no incluye los certificados", más abajo). Sin este
paso el sistema arranca pero **no puede facturar**:

1. Conseguir `homologacion.crt` y `homologacion.key` (el certificado y la
   clave privada generados en WSASS con el CUIT personal de pruebas — ver
   `CLAUDE.md` → "Facturación (ARCA)" → "Homologación vs. Producción").
2. Copiarlos a `C:\Ferreteria\certs\`, con esos nombres exactos (el `.env`
   generado por el instalador ya apunta ahí — hay un `LEEME.txt` en esa
   carpeta con el mismo recordatorio).
3. Reiniciar el servicio para que tome los certificados:
   ```
   C:\Ferreteria\_instalador\nssm.exe restart FerreteriaBackend
   ```

### Verificar que quedó bien

1. Abrir el acceso directo "Ferretería" del escritorio — tiene que cargar
   Ventas sin errores.
2. Crear un cliente, abrir su ficha, cargar una línea, pedir el
   presupuesto — tiene que bajar un PDF.
3. Reiniciar la PC completa y confirmar que el sistema arrancó solo, sin
   tener que hacer nada a mano.
4. Correr el backup a mano una vez para probarlo (no hace falta esperar a
   la noche):
   ```
   schtasks /run /tn "FerreteriaBackup"
   ```
   Y confirmar en `C:\Ferreteria\backups\` que aparecieron los 5 archivos
   del día (ver `scripts/README-backup.md`).
5. **Probar el restore del dump al menos una vez** — ver
   `scripts/README-backup.md` → "RESTORE". Un backup que nunca se restauró
   no es un backup.

### Desinstalar

Panel de control → Programas → "Sistema Ferretería" → Desinstalar. Saca el
servicio, la tarea programada y los archivos de `C:\Ferreteria`.
**NUNCA borra la base de datos de PostgreSQL ni la carpeta de backups** —
los datos del negocio no se borran por un desinstalador. Si de verdad hace
falta borrarlos, es a mano y aparte.

---

## 2. Cómo se compila el instalador

Esto lo hace quien prepara una instalación o actualización (Mateo), en la
PC de **desarrollo** — no hace falta en la PC del local, ahí solo se corre
el `.exe` ya compilado.

1. **Juntar los binarios de terceros** en `sistema-local/installer/vendor/`
   (no se versionan, hay que conseguirlos una vez — ver
   `installer/vendor/README.md` para los links). **Las versiones EXACTAS
   usadas la última vez** (ver "Versiones exactas usadas" más abajo — sin
   esto, en seis meses no se sabe qué iba ahí):
   - `vendor/node/` — runtime portable de Node.js para Windows (el ZIP, no
     el instalador).
   - `vendor/postgresql-installer.exe` — instalador de PostgreSQL (EDB).
   - `vendor/nssm.exe` — NSSM.

### Versiones exactas usadas (para reconstruir el instalador en 6 meses)

**Regla al elegir versiones: PostgreSQL del instalador tiene que ser la
MISMA VERSIÓN MAYOR que la de la PC de desarrollo** (ahí se generan y
prueban los backups/dumps — un dump de una versión mayor distinta puede no
restaurar limpio en la otra; ya se vio el caso del `\restrict` que PG18
agrega al dump, que una versión mayor anterior no entiende). Antes de
armar un instalador nuevo, correr `psql --version` y `node -v` en la PC de
desarrollo y confirmar que coinciden en versión mayor con lo de acá abajo
(actualizar esta tabla si no).

| Binario | Versión en dev (verificado acá) | Versión embebida en el instalador | De dónde se bajó |
|---|---|---|---|
| Node.js | `v24.15.0` (`node -v`) | **`v24.15.0`** (exacta, no solo la mayor) | https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip |
| PostgreSQL | `18.3` (`psql --version` / `SHOW server_version`) | **`18.4-2`** (misma MAYOR, 18 — EDB solo publica el último minor de cada mayor, no hay forma de bajar el 18.3 exacto de nuevo) | https://get.enterprisedb.com/postgresql/postgresql-18.4-2-windows-x64.exe (link resuelto desde https://www.enterprisedb.com/downloads/postgres-postgresql-downloads — el número de build, acá "-2", cambia sin aviso, resolver de nuevo desde esa página si hace falta reconstruir) |
| NSSM | — (no aplica, no corre en dev) | `2.24` (release estable, no el build de CI `2.24-101-...`) | https://nssm.cc/release/nssm-2.24.zip (usar `win64/nssm.exe` de adentro del zip, NO `win32/`) |

Checksums SHA-256 de lo que se bajó y quedó embebido (para confirmar que un
re-download trajo exactamente lo mismo, o detectar si EDB/nssm.cc
reemplazaron el archivo de esa URL):

```
node-v24.15.0-win-x64.zip:     cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62
postgresql-18.4-2-windows-x64.exe: 0698d1a6083da490e5a57149257f5d9220d8c34109ed11b38aa592d320bf5385
nssm.exe (win64, de nssm-2.24.zip): f689ee9af94b00e9e3f0bb072b34caaf207f32dcb4f5782fc9ca351df9a06c97
```

El checksum de Node.js se puede re-verificar contra el que Node.js publica
oficialmente en `https://nodejs.org/dist/v24.15.0/SHASUMS256.txt`. EDB y
nssm.cc no publican checksums propios — el valor de acá arriba es la única
referencia para detectar un archivo distinto en un re-download futuro.

2. **Armar el build** desde `sistema-local/backend/`:
   ```
   npm run build:prod
   ```
   (compila el frontend, lo copia a `backend/public/`, compila el backend a
   `backend/dist/` — ver `CLAUDE.md` → "Despliegue" → Fase 1).

3. **Compilar el instalador** con Inno Setup — instalar Inno Setup 6
   (https://jrsoftware.org/isdl.php) y correr:
   ```
   ISCC.exe sistema-local\installer\ferreteria.iss
   ```
   El resultado queda en `sistema-local/installer/Output/FerreteriaSetup.exe`.

Ese `.exe` es lo único que hace falta copiar a la PC del local — ya tiene
todo adentro (Node, y si conseguiste el instalador de Postgres y NSSM,
también esos).

### Reemplazar el ícono cuando llegue el logo real

`installer/app.ico` es un ícono genérico (letra "F" sobre fondo azul) hecho
para no dejar el instalador sin ícono mientras no está el logo real de la
ferretería. Para reemplazarlo:

1. Conseguir el logo en un `.ico` — se puede convertir un `.png`/`.jpg` con
   cualquier conversor online, o con PowerShell (`System.Drawing`) igual
   que se generó el placeholder. Recomendado incluir varios tamaños (16,
   32, 48, 256 px) en el mismo `.ico` para que se vea bien en el escritorio
   y en el explorador de archivos.
2. Reemplazar `sistema-local/installer/app.ico` con el archivo nuevo (mismo
   nombre).
3. Recompilar el instalador (paso 3 de arriba) — el ícono nuevo queda tanto
   en el instalador mismo como en el acceso directo del escritorio que crea.

### Por qué el instalador no incluye los certificados de ARCA

La clave privada (`.key`) de un certificado de ARCA es la llave fiscal de
la empresa — quien la tenga puede facturar en su nombre. Un `.exe` que la
contenga es un archivo que se puede copiar, mandar por mail o perder en un
pendrive sin querer. Por eso el instalador arma la app y el `.env` sin
tocar `certs/`, y ese paso queda manual, documentado arriba (PC de destino,
no de desarrollo, copiando el archivo directo).

---

## Anexo — Paso a paso manual (respaldo si el instalador falla)

Todo lo que hace el instalador de la sección 1, explicado paso a paso para
hacerlo a mano. Usar esto si el `.exe` no compiló, no corrió, o falló en
algún paso puntual (el instalador avisa en qué paso falló con un mensaje).

### A0. Qué vas a necesitar

Lo mismo que en la sección 1, salvo el `.exe` — acá hace falta instalar
Node.js aparte (paso A2).

### A1. Instalar PostgreSQL (servicio nativo de Windows)

1. Descargar el instalador de PostgreSQL para Windows desde
   https://www.postgresql.org/download/windows/ (o `choco install
   postgresql` si tenés Chocolatey). Usá una versión reciente (16 o
   superior).
2. Durante la instalación:
   - Anotá la contraseña que le pongas al superusuario `postgres` — la vas
     a necesitar en el paso siguiente y no en el `.env` del sistema (el
     sistema usa un usuario propio, no el superusuario — ver más abajo).
   - Dejá tildado "Install as a Windows Service" con arranque automático
     (es la opción por defecto del instalador).
3. Verificar que el servicio quedó en arranque automático:

   ```
   sc qc postgresql-x64-<version>
   ```

   Tiene que decir `AUTO_START` en `START_TYPE`. Si por algo quedó en
   manual, corregirlo (ojo: `sc config` necesita el espacio después de
   `start=`, si no falla en silencio):

   ```
   sc config postgresql-x64-<version> start= auto
   ```

4. Crear la base y un usuario PROPIO del sistema (no uses el superusuario
   `postgres` para la app — es una instalación real, no un dev container).
   Abrí una consola y corré `psql` como el superusuario:

   ```
   psql -U postgres
   ```

   Y dentro de `psql`:

   ```sql
   CREATE USER ferreteria_app WITH PASSWORD 'una-contraseña-fuerte-acá';
   CREATE DATABASE ferreteria_local OWNER ferreteria_app;
   \c ferreteria_local
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   \q
   ```

   El `CREATE EXTENSION` con el superusuario es **necesario hacerlo acá**:
   TypeORM intenta crearla solo al conectarse, pero el usuario
   `ferreteria_app` no tiene permiso de superusuario para eso — si no la
   creás ahora, las migraciones van a fallar más adelante generando IDs.

### A2. Instalar Node.js

Instalá Node.js desde https://nodejs.org (elegí la versión LTS). Verificá
la versión instalada:

```
node --version
```

Tiene que ser una LTS reciente (Angular 22 necesita una versión relativamente
nueva de Node — la PC de desarrollo usa v24.15.0; con esa o cualquier LTS
igual o más nueva estás cubierto). Si el sistema no arranca por versión de
Node, ese es el primer lugar para mirar.

### A3. Copiar el build y crear el `.env`

En la PC de **desarrollo**, dentro de `sistema-local/backend/`:

```
npm run build:prod
```

Esto compila el frontend, lo copia a `backend/public/` y compila el
backend a `backend/dist/` (ver `CLAUDE.md` → "Despliegue" para el detalle
del pipeline).

Copiá a la PC del local, dentro de la misma carpeta `backend/`:
- `dist/` (el backend compilado)
- `public/` (el frontend, ya copiado ahí por `build:prod`)
- `node_modules/` (dependencias de producción — `npm ci --omit=dev` corrido
  en la PC del local, o copiado directo si es la misma arquitectura)
- `package.json` (para poder correr `npm run backup`, migraciones, etc.)
- `iniciar-backend.bat` y `ejecutar-backup.bat` (ya vienen en el repo, no
  hace falta escribirlos a mano — ver pasos A5 y A7; ojo, estos usan el
  Node del PATH del sistema, a diferencia de los que arma el instalador de
  la sección 1, que usan el Node embebido)
- La carpeta `certs/` (el certificado de ARCA — homologación por ahora, dos
  niveles arriba de `backend/`, mismo lugar que en desarrollo)

Creá el `.env` real a partir de la plantilla:

```
copy .env.production.example .env
```

Y completá los valores reales (`DB_PASSWORD` = la contraseña que le pusiste
a `ferreteria_app` en el paso A1, datos del emisor, rutas de backup, etc. —
la plantilla trae cada variable comentada). **El `.env` no se versiona ni
sale de esta PC.**

### A4. Migraciones

No hace falta correrlas a mano: `AppModule` tiene `migrationsRun: true`
(ver `src/app.module.ts`), así que corren solas cada vez que arranca el
backend, incluida la primera vez. Se puede confirmar mirando el log al
arrancar (paso siguiente) — tiene que aparecer algo como
`query: SELECT * FROM "migrations" ...` sin errores.

Si en algún momento hace falta correrlas a mano (por ejemplo, para
verificar antes de exponer el sistema), desde `backend/`:

```
npm run migration:run
```

### A5. Arranque automático del backend

Dos opciones. **NSSM es la recomendada**: arranca sin que nadie inicie
sesión en Windows y reinicia solo si el proceso se cae. Task Scheduler es
más simple pero no reinicia solo ante una caída (hay que activarlo a mano,
ver abajo).

#### Opción recomendada: NSSM

1. Instalar NSSM: `choco install nssm`, o bajarlo de https://nssm.cc y
   agregarlo al PATH.
2. Instalar el servicio apuntando a `iniciar-backend.bat` (ya en el repo,
   se ubica solo con la carpeta donde esté — no hace falta editar rutas
   adentro):

   ```
   nssm install FerreteriaBackend "C:\ruta\a\sistema-local\backend\iniciar-backend.bat"
   nssm set FerreteriaBackend Start SERVICE_AUTO_START
   nssm set FerreteriaBackend AppExit Default Restart
   nssm start FerreteriaBackend
   ```

3. Verificar que quedó corriendo:

   ```
   nssm status FerreteriaBackend
   ```

   Y abrir http://localhost:3000 en el navegador (ver paso A6).

Para reiniciar el servicio después de actualizar el sistema:
`nssm restart FerreteriaBackend`.

#### Alternativa simple: Task Scheduler

1. Abrir el Programador de tareas (`taskschd.msc`) → "Crear tarea" (no
   "Crear tarea básica", para tener acceso a todas las opciones).
2. Pestaña **General**: nombre "FerreteriaBackend". Tildar "Ejecutar tanto
   si el usuario inició sesión como si no" y "Ejecutar con los privilegios
   más altos".
3. Pestaña **Desencadenadores** → Nuevo → "Al iniciar el equipo".
4. Pestaña **Acciones** → Nueva → Programa/script:
   `C:\ruta\a\sistema-local\backend\iniciar-backend.bat` (usar la ruta
   completa; no hace falta nada en "Argumentos" ni en "Iniciar en", el
   `.bat` se ubica solo).
5. Pestaña **Configuración** → tildar "Si la tarea produce un error,
   reiniciarla cada" (ej. cada 1 minuto, hasta 3 intentos) — esto es lo que
   NSSM hace solo y acá hay que activarlo a mano.

Equivalente por línea de comandos (mismo resultado que los pasos 1-4 de
arriba, sin el reinicio automático del paso 5):

```
schtasks /create /tn "FerreteriaBackend" /tr "C:\ruta\a\sistema-local\backend\iniciar-backend.bat" /sc onstart /ru SYSTEM /rl highest
```

### A6. Acceso directo para el titular

Con el backend corriendo (paso A5), crear un acceso directo en el
Escritorio a `http://localhost:3000` — es el único puerto: ahí está todo,
el sistema completo (ver `CLAUDE.md` → "Despliegue"). El instalador de la
sección 1 usa un launcher más prolijo (`abrir-ferreteria.vbs`, sin barra de
direcciones, esperando a que el servicio responda) — si se quiere ese mismo
comportamiento a mano, apuntar el acceso directo a
`wscript.exe "C:\ruta\a\installer\abrir-ferreteria.vbs"` en vez de a la URL
directa.

Forma más simple (sin el launcher): clic derecho en el Escritorio → Nuevo →
Acceso directo → pegar `http://localhost:3000` como ubicación → siguiente →
ponerle un nombre (ej. "Sistema Ferretería") → Finalizar.

### A7. Backup automático

El script de backup (`npm run backup`, ver `scripts/README-backup.md`) ya
está armado y probado — falta programarlo para que corra solo todas las
noches.

1. Abrir el Programador de tareas (`taskschd.msc`) → "Crear tarea".
2. **General**: nombre "FerreteriaBackup". Tildar "Ejecutar tanto si el
   usuario inició sesión como si no".
3. **Desencadenadores** → Nuevo → "Diariamente", horario sugerido 23:30 (o
   cualquier hora en que la PC quede prendida y sin uso).
4. **Acciones** → Nueva → Programa/script:
   `C:\ruta\a\sistema-local\backend\ejecutar-backup.bat` (ruta completa;
   igual que en el paso A5, el `.bat` se ubica solo).

Equivalente por línea de comandos:

```
schtasks /create /tn "FerreteriaBackup" /tr "C:\ruta\a\sistema-local\backend\ejecutar-backup.bat" /sc daily /st 23:30 /ru SYSTEM
```

#### Cómo verificar que corrió

Dos archivos en `backend/` lo confirman:
- `backup-tarea-programada.log` — una línea de "arrancando"/"terminado" por
  corrida, con el exit code (0 = OK). Lo escribe `ejecutar-backup.bat`.
- `backup.log` (dentro de `BACKUP_DIR_LOCAL`, el que configuraste en el
  `.env`) — el detalle de cada backup: qué se generó, qué destino falló,
  cuántos archivos se retuvieron/borraron. Lo escribe el script.

También se puede correr manualmente para probar sin esperar a la noche:

```
schtasks /run /tn "FerreteriaBackup"
```

Y confirmar en `BACKUP_DIR_LOCAL` que aparecieron `dump_<fecha>.sql`,
`saldos_<fecha>.csv`, `fichas_abiertas_<fecha>.csv`, `clientes_<fecha>.csv`
y `caja_<fecha>.csv` con la fecha de hoy.

### Troubleshooting rápido

- **El navegador no carga nada en :3000**: el servicio/tarea no está
  corriendo. `nssm status FerreteriaBackend` (o revisar el Programador de
  tareas → historial) y mirar si hay algo en `backend/dist/main.js` (o
  `C:\Ferreteria\dist\main.js` si se instaló con el `.exe`) que tire error
  al arrancar (correrlo a mano una vez para ver el error completo en
  consola).
- **Error de conexión a la base al arrancar**: revisar `DB_*` en el `.env`
  contra lo que se creó en el paso A1, y que el servicio de Postgres esté
  `Running` (`sc query postgresql-x64-<version>`).
- **Error de permisos creando UUIDs**: falta el `CREATE EXTENSION
  "uuid-ossp"` del paso A1 — correrlo con el superusuario `postgres`, no con
  `ferreteria_app`.
- **Factura no emite / error de ARCA**: fuera del alcance de esta guía —
  ver `CLAUDE.md` → "Facturación (ARCA)" → "Homologación vs. Producción".
