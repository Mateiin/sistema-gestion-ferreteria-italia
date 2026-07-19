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
- Opcional, para el backup: un pendrive ya etiquetado (ver "Etiquetar el
  pendrive de backup" más abajo) y/o Google Drive para escritorio ya
  instalado y con sesión iniciada (ver "Instalar y configurar Google Drive"
  más abajo). Ninguno de los dos es obligatorio para terminar la
  instalación — el wizard los pide como opcionales y se pueden completar
  después, a mano, editando el `.env`.

### Qué hace el instalador, solo

1. Detecta si PostgreSQL ya está instalado. Si no, lo instala desatendido
   (nadie tiene que clickear nada en esa parte).
2. Crea un usuario y una base de datos PROPIOS de la app (`ferreteria_app`
   / `ferreteria_local`), con una contraseña ALEATORIA generada en el
   momento — nunca hay una contraseña fija adentro del `.exe`. Si Postgres se
   instaló desde cero en este paso, la contraseña del superusuario `postgres`
   también es aleatoria: queda guardada en `PG_SUPERUSER_PASSWORD` dentro del
   `.env` generado (paso 4) y **además se muestra una sola vez en pantalla**
   al terminar — anotala aparte (gestor de contraseñas), la vas a necesitar
   para restaurar un backup (ver `scripts/README-backup.md` → RESTORE).
3. Copia la aplicación a `C:\Ferreteria` — backend compilado + frontend +
   **Node.js embebido** (no hace falta instalar Node aparte en la PC del
   local, viene adentro).
4. Genera el `.env` con esa contraseña + los datos del emisor + los destinos
   de backup que pediste en el wizard (carpeta local, etiqueta del pendrive,
   carpeta de Google Drive — ver "Configurar los destinos de backup" más
   abajo). ARCA queda en homologación — el salto a producción es aparte, a
   mano (ver `CLAUDE.md` → "Despliegue" → Fase 3).
5. Registra el backend como **servicio de Windows** (NSSM): arranque
   automático al prender la PC, sin que nadie tenga que iniciar sesión, y
   se reinicia solo si se cae.
6. Crea la **tarea programada** del backup con dos triggers: diaria a las
   19:00 y al inicio del sistema (si la PC estaba apagada, corre cuando se
   prende al otro día — `registrar-tarea-backup.ps1`).
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

**No hace falta reiniciar el servicio.** La carga de los certificados es
perezosa (resuelta recién al facturar, no al arrancar — ver hallazgo del
2026-07-16 más abajo): mientras no estén, el sistema entero funciona igual
(Caja, Clientes, Ventas, presupuesto) y solo el endpoint de facturar
devuelve un error claro. Apenas copiás los archivos, la SIGUIENTE factura
los toma solos, sin reiniciar nada.

### Configurar los destinos de backup (pendrive y Google Drive)

El backup corre solo todas las noches (paso 6 de arriba), pero **el destino
local no alcanza** — si se rompe el disco de esta PC, el backup local se
pierde con todo lo demás. Pendrive y Google Drive son opcionales en el
wizard a propósito (no todos los locales tienen uno de los dos a mano el día
de la instalación), pero conviene dejar configurado al menos uno de los dos
apenas se pueda — el sistema avisa con un aviso discreto arriba de todas las
pantallas si hace más de 3 días que no hay copia externa (ver "Aviso de
backup sin copia externa" más abajo).

#### Etiquetar el pendrive de backup

El sistema busca el pendrive por su **etiqueta de volumen** (no por la letra
de unidad — así funciona en cualquier puerto USB, sin importar qué letra le
toque). Para ponerle una etiqueta:

1. Conectar el pendrive.
2. Abrir "Este equipo" en el Explorador de archivos, clic derecho sobre la
   unidad del pendrive → "Cambiar nombre" (o "Propiedades" → campo de
   nombre) → escribir la etiqueta (ej. `BACKUP_FERRE`, sin espacios ni
   caracteres raros — más simple y menos margen de error).
3. Anotar esa misma etiqueta, exacta, para escribirla en el wizard del
   instalador (o en `BACKUP_PENDRIVE_LABEL` del `.env`, si se configura
   después).

Alternativa por línea de comandos (`E:` es la letra que tenga el pendrive
en ese momento — solo importa para este comando puntual, no para el uso
normal del sistema):

```
label E: BACKUP_FERRE
```

El sistema crea sola una carpeta `FerreteriaBackups` dentro del pendrive la
primera vez que corre el backup — no hace falta crearla a mano.

#### Instalar y configurar Google Drive para escritorio

**Esto el instalador NO lo hace** — a propósito: instalar Google Drive para
escritorio requiere iniciar sesión con una cuenta de Google de forma
interactiva (usuario y contraseña, verificación en dos pasos), algo que un
`.exe` desatendido no puede completar solo. Es un paso manual, después de
instalar:

1. Descargar "Google Drive para escritorio" desde
   https://www.google.com/drive/download/ e instalarlo (wizard normal de
   Windows, nada especial).
2. Iniciar sesión con la cuenta de Google del titular del negocio (no la
   personal de quien instala, si son distintas — es la cuenta que va a
   quedar dueña de esos backups).
3. Una vez sincronizado, anotar la ruta local de la carpeta que Drive crea
   en esta PC (por default algo como
   `C:\Users\<usuario>\Google Drive\Mi unidad\`, configurable durante su
   propio setup) — esa ruta es lo que va en `BACKUP_DIR_DRIVE`.
4. Editar `C:\Ferreteria\.env` a mano y completar (o corregir)
   `BACKUP_DIR_DRIVE` con esa ruta. No hace falta reiniciar el servicio: el
   script de backup lee el `.env` en cada corrida, no al arrancar.

#### Cambiar los destinos después de instalar

Los tres (`BACKUP_DIR_LOCAL`, `BACKUP_PENDRIVE_LABEL`, `BACKUP_DIR_DRIVE`)
son simples variables en `C:\Ferreteria\.env` — se pueden agregar, corregir
o borrar a mano en cualquier momento con un editor de texto, sin reinstalar
y sin reiniciar el servicio (ver `scripts/README-backup.md` para el detalle
de cada variable, incluida la forma vieja `BACKUP_DIR_PENDRIVE` de ruta fija
si se prefiere esa en vez de la etiqueta).

#### Aviso de backup sin copia externa

Arriba de todas las pantallas del sistema (`layout/backup-alerta/`) aparece
un aviso discreto, sin bloquear nada, si hace más de 3 días que no hubo un
backup exitoso en pendrive **ni** en Drive — por ejemplo "Hace 5 días que no
se hace copia de seguridad externa (pendrive o Google Drive). Revisá que
esté conectado." No aparece nada si alguno de los dos destinos está al día.
Se puede probar a mano corriendo el backup con el pendrive desconectado y
mirando `C:\Ferreteria\backups\estado-backup.json` (o directamente la
pantalla, recargando).

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
   del día más `estado-backup.json` (ver `scripts/README-backup.md`).
5. **Probar el restore del dump al menos una vez** — ver
   `scripts/README-backup.md` → "RESTORE". Un backup que nunca se restauró
   no es un backup.

### Desinstalar

Panel de control → Programas → "Sistema Ferretería" → Desinstalar. Saca el
servicio, la tarea programada y los archivos de `C:\Ferreteria`.
**NUNCA borra la base de datos de PostgreSQL ni la carpeta de backups** —
los datos del negocio no se borran por un desinstalador. Si de verdad hace
falta borrarlos, es a mano y aparte.

**Residuo conocido:** el `.env` generado (con la contraseña de `ferreteria_app`
en texto plano) no lo borra el desinstalador — no es un archivo que Inno
gestione (se generó en tiempo de instalación con `SaveStringToFile`, no está
en `[Files]`). Si de verdad hace falta limpiar `C:\Ferreteria` del todo,
incluido el `.env`, es a mano.

---

## Prueba real hecha en la PC de desarrollo (2026-07-16) — hallazgos

Instalación de punta a punta probada en la máquina de desarrollo (que ya
tenía Postgres 18.3 y una base `ferreteria_local` propia — ver más abajo
cómo se evitó la colisión). **No reemplaza probarlo en una PC limpia del
local**, pero encontró varios problemas reales que antes solo eran teóricos:

1. ~~El `.exe` compilado el 2026-07-15 no incluía el frontend.~~ **Corregido
   (2026-07-16).** `backend/public/` no existía en el momento de compilar
   (nadie corrió `npm run build:prod` justo antes) y el `.iss` usa
   `Flags: skipifsourcedoesntexist` para esa carpeta — así que el instalador
   compiló y corrió *sin ningún error*, pero `C:\Ferreteria\public\` nunca
   se creó (`http://localhost:3000/` daba 404, solo `/api/...` funcionaba).
   Se agregó un **guard de compilación** en `ferreteria.iss` (chequeos
   `#if !FileExists(...) / #error` del preprocesador de Inno Setup) que
   frena la compilación con un mensaje claro si falta `backend/public/index.html`,
   `backend/dist/main.js`, `env.template` o cualquiera de los binarios de
   `vendor/`. Además, `installer/compilar-instalador.ps1` (nuevo, reemplaza
   correr `ISCC.exe` a mano) verifica que el `.exe` resultante pese más de
   350MB — un instalador chico es la señal de que algo se coló igual. Ver
   "Cómo se compila el instalador" más abajo.
2. ~~El servicio NSSM queda en estado `PAUSED` si el backend crashea varias
   veces seguidas al arrancar~~ **Corregido de raíz (2026-07-16).** Antes,
   sin `certs\homologacion.crt`, el `FacturacionModule` tiraba una excepción
   no capturada AL ARRANCAR y **toda la app se caía** (Caja/Ventas/Clientes
   tampoco funcionaban, no solo facturación) — NSSM reintentaba con backoff
   creciente y terminaba pausando el servicio. Se cambió la carga de los
   certificados a **perezosa**: `cargarEmisorDesdeEnv()`
   (`facturacion/config/emisor.ts`) ya no lee los archivos `.crt`/`.key` al
   armar el `Emisor` — quedan como getters que recién leen el archivo (y
   cachean) la primera vez que alguien factura de verdad. La app ahora
   arranca siempre; si faltan los certificados, solo el endpoint de
   facturar devuelve un error claro (`FacturacionGestor.resolverProviderArca`
   traduce `CertificadosArcaFaltantesError` a un 500 con el mensaje).
   Verificado con el backend de dev: sin certs, `/api/clientes` responde
   `200` y `POST /api/facturacion/facturas` responde `500` con
   "Faltan los certificados de ARCA..."; copiando los certificados (sin
   reiniciar nada), la siguiente factura ya sale con CAE real. Esto también
   resuelve el `PAUSED` de NSSM: si el backend no crashea en loop, el
   servicio nunca entra en ese estado.
3. **`/VERYSILENT` no sirve para instalar sin supervisión — limitación
   aceptada, no se va a arreglar.** El wizard custom (`PaginaEmisor`) no se
   muestra en modo silencioso, pero su validación (`NextButtonClick`) corre
   igual y exige Razón social/CUIT no vacíos — como quedan vacíos, la
   instalación **aborta por completo** (`EAbort`) antes de tocar Postgres.
   El `.iss` no soporta `/LOADINF` ni ningún parámetro para precargar esos
   valores, **y a propósito no se va a agregar soporte**: la instalación es
   una sola vez por PC y el wizard interactivo alcanza — no vale la pena la
   complejidad de `/LOADINF` para un caso de uso que no existe. Instalación
   desatendida de verdad (sin que alguien esté sentado completando el
   wizard) **no está soportada**: hay que completarlo a mano.
4. **Confirmado que el desinstalador nunca toca la base de datos ni los
   backups** — comportamiento por diseño, verificado borrando y
   reinstalando.
5. **No se pudo probar en esta corrida** (limitaciones del entorno, no del
   instalador): instalar PostgreSQL desde cero (ya había uno en la
   máquina), el wizard interactivo real completado a mano, y que el acceso
   directo abra Edge en modo `--app` (no se abrió navegador en esta prueba).
   Tampoco se pudo iniciar/detener el servicio NSSM ni consultar el
   Programador de Tareas desde la sesión que hizo la prueba — la terminal
   era miembro del grupo Administradores pero con un token NO elevado
   (`IsInRole(Administrator)` devolvía `False`; acceso denegado hasta para
   *listar* `C:\Windows\System32\Tasks`), aunque el instalador y el
   desinstalador sí corrieron con privilegios completos (su manifiesto pide
   elevación aparte). Para una próxima prueba, abrir la terminal con
   "Ejecutar como administrador" de verdad (clic derecho, confirmar UAC) en
   vez de asumir que alcanza con pertenecer al grupo.

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

3. **Compilar el instalador** — instalar Inno Setup 6
   (https://jrsoftware.org/isdl.php) y correr el script wrapper (no `ISCC.exe`
   directo — ver por qué abajo):
   ```
   powershell -File sistema-local\installer\compilar-instalador.ps1
   ```
   El resultado queda en `sistema-local/installer/Output/FerreteriaSetup.exe`.

Ese `.exe` es lo único que hace falta copiar a la PC del local — ya tiene
todo adentro (Node, y si conseguiste el instalador de Postgres y NSSM,
también esos).

#### Por qué un script wrapper y no `ISCC.exe` directo

Ya pasó dos veces que el `.exe` compiló "bien" pero salió incompleto, porque
`[Files]` en `ferreteria.iss` usa `skipifsourcedoesntexist` para no romper a
alguien iterando el wizard sin `vendor/` completo — eso significa que un
archivo que falta se omite EN SILENCIO, no frena la compilación. Primero fue
`postgresql-installer.exe`/`env.template` (instalador de ~51MB), después fue
`backend/public/` entero (instalador sin frontend, `/` daba 404 — ver
hallazgo del 2026-07-16 más abajo). Dos redes distintas, por si una se cuela:

1. **`ferreteria.iss` tiene un guard al principio del archivo** (chequeos
   `#if !FileExists(...) / #error` del preprocesador, ISPP): si falta
   `vendor/node/node.exe`, `vendor/postgresql-installer.exe`,
   `vendor/nssm.exe`, `plantillas/env.template`, `backend/dist/main.js` o
   `backend/public/index.html`, **la compilación aborta con un mensaje
   claro** en vez de generar un `.exe` incompleto. Esto corre incluso si
   compilás con `ISCC.exe` directo.
2. **`compilar-instalador.ps1`** corre `ISCC.exe` y, si compiló bien,
   verifica que `Output\FerreteriaSetup.exe` pese más de 350MB — un
   instalador chico es la señal de que algo se coló igual (por ejemplo, un
   archivo nuevo que se agregue a `[Files]` en el futuro sin su chequeo
   correspondiente en el guard de arriba).

Si de verdad hace falta compilar sin alguno de los binarios de `vendor/`
(por ejemplo, iterando solo el wizard, sin querer bajar Postgres todavía),
comentar la línea correspondiente del guard en `ferreteria.iss` a mano — a
propósito no hay una forma de saltearlo por parámetro, para que no quede un
hueco permanente sin querer.

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

**Ojo, no confundir con el logo de los PDF** (ver sección siguiente): son
dos archivos distintos, con formatos distintos (`.ico` acá vs `.png` allá) y
usos distintos (ícono del acceso directo/instalador vs encabezado de
factura/presupuesto). Reemplazar uno no reemplaza el otro.

### Logo del emisor (en los PDF y en el instalador) — hecho, ver detalle

El logo real de la ferretería (`certs/logo-ferreteria.png` en la raíz del
repo para desarrollo, `installer/assets/logo-ferreteria.png` para el
instalador) ya está integrado. Un logo NO es un secreto (es el mismo que va
en la cartelería del local), a diferencia de los certificados de ARCA — por
eso, a diferencia de esos, **sí viaja embebido en el instalador** y se
copia solo:

- **En el PDF** (factura, nota de crédito y presupuesto): `formato-arca.ts`
  (`armarEncabezadoArca`) lo dibuja arriba a la izquierda del bloque emisor,
  en el lugar donde si no hay logo va el texto de la razón social. Se
  renderiza con `fit: [110, 45]` de pdfmake (ancho y alto MÁXIMOS, escala
  manteniendo proporción) — un logo grande no puede romper el encabezado ni
  empujar el resto de los datos del emisor hacia abajo. La fuente es
  `EMISOR_LOGO_PATH` (`config/emisor.ts` → `cargarLogoDataUrl`), resuelta a
  dataURL de forma perezosa; si el archivo no está o no se puede leer, cae
  sin romper nada al texto de la razón social (mismo comportamiento de
  siempre, solo verificado de nuevo con este logo real).
- **En el instalador**: `ferreteria.iss` copia
  `installer/assets/logo-ferreteria.png` → `{app}\certs\logo-ferreteria.png`
  durante la instalación (`[Files]`, con `skipifsourcedoesntexist` —
  **opcional a propósito**, NO está en el guard de `#error` de la sección
  2: si el archivo faltara, el instalador compila igual y el sistema cae al
  texto). `env.template` deja `EMISOR_LOGO_PATH=certs\logo-ferreteria.png`
  seteado por defecto en el `.env` generado — el titular no tiene que
  copiar nada a mano.
- **Tamaño del archivo**: el logo original (2584×834, 2,3MB) se redujo a
  440×142 (~110KB, 4× el ancho máximo de display en el PDF, de sobra para
  verse nítido) antes de embeberlo — sin este paso, cada factura/presupuesto
  generado arrastraría esos 2,3MB de más.
- Para reemplazar el logo por uno nuevo más adelante: pisar los dos archivos
  (`certs/logo-ferreteria.png` en dev, `installer/assets/logo-ferreteria.png`
  para el instalador) con el archivo nuevo — PNG o JPG, pdfmake no soporta
  otros formatos — y recompilar el instalador (paso 3 de la sección
  anterior) para que el `.exe` lo lleve adentro.

### Por qué el instalador no incluye los certificados de ARCA

La clave privada (`.key`) de un certificado de ARCA es la llave fiscal de
la empresa — quien la tenga puede facturar en su nombre. Un `.exe` que la
contenga es un archivo que se puede copiar, mandar por mail o perder en un
pendrive sin querer. Por eso el instalador arma la app y el `.env` sin
tocar `certs/`, y ese paso queda manual, documentado arriba (PC de destino,
no de desarrollo, copiando el archivo directo).

---

## 3. Salto a ARCA producción (Fase 3)

**Todo lo de arriba deja el sistema trabajando contra HOMOLOGACIÓN a
propósito.** Esta sección es el paso aparte, manual y consciente, para
pasar a facturar de verdad. No lo hagas hasta que el titular confirme que
está listo (trámite de ARCA production completo, certificado en mano) — ver
`CLAUDE.md` → "Qué NO hacer".

### 0. Qué vas a necesitar antes de empezar

- El certificado de **PRODUCCIÓN** que emite ARCA (`.crt` + `.key`) — NO el
  generado en WSASS para homologación. Un cert de homologación da
  "computador no autorizado" contra producción, y viceversa (ver
  `CLAUDE.md` → "Facturación (ARCA)" → "Homologación vs. Producción").
- El **CUIT de la empresa** (Refrigeración Dimundo S.A.S.), no el CUIT
  personal que se usa en homologación mientras se prueba.
- El **punto de venta** real: el "RECE para aplicativo y web services"
  creado en el portal de ARCA para producción — distinto del "1" de
  homologación, y distinto del que el titular ya usa para facturar a mano
  desde la web de ARCA (tiene que ser exclusivo de este sistema).

### 1. Validar el certificado ANTES de tocar el `.env` real (recomendado)

No hace falta arriesgar el `.env` en marcha para probar el certificado
nuevo. En la PC del local (o en cualquier PC con este repo y con conexión a
internet):

1. Copiá el certificado de producción a una carpeta cualquiera (no hace
   falta que sea `certs\` todavía).
2. Copiá `.env.produccion.example` a `.env.produccion` (en
   `C:\Ferreteria\` si es la instalada con el `.exe`, o en
   `sistema-local/backend/` en la PC de desarrollo) y completá
   `EMISOR_CUIT`, `EMISOR_PUNTO_VENTA`, `ARCA_CERT_PATH` y `ARCA_KEY_PATH`
   apuntando a los archivos del paso 1. Dejá `ARCA_AMBIENTE=produccion`
   como está.
3. Corré:
   ```
   npm run verificar:prod
   ```
   Este script es de **SOLO LECTURA**: autentica contra WSAA con el
   certificado nuevo y le pregunta a WSFEv1 cuál es el último comprobante
   autorizado para Factura A y Factura B en ese punto de venta (0 si
   todavía nunca se facturó desde ahí). **No emite nada, no genera CAE, no
   deja huella fiscal.** Si el certificado, el CUIT o el punto de venta
   están mal, el error de ARCA sale acá, sin haber tocado el sistema real
   todavía.
4. Si algo fallá (ej. error 600 "No apareció CUIT en lista de relaciones",
   o "computador no autorizado"): revisar que los tres valores (CUIT del
   certificado, `EMISOR_CUIT`, y que el CUIT esté asociado al servicio
   "Facturación Electrónica" en el portal de ARCA para ese punto de venta)
   sean consistentes antes de reintentar. Fuera del alcance de esta guía —
   ver `CLAUDE.md` → "Facturación (ARCA)".

`.env.produccion` (a diferencia de `.env.produccion.example`) nunca se
versiona (mismo patrón `.env.*` del `.gitignore`) y solo lo lee este
script — el sistema en marcha (`npm run start:prod` / el servicio
`FerreteriaBackend`) sigue usando el `.env` de siempre, sin tocarlo.

### 2. Recién ahí, aplicar el cambio real

Una vez que `npm run verificar:prod` respondió bien:

1. Copiar `ferreteria.crt` / `ferreteria.key` de producción a
   `C:\Ferreteria\certs\` (o los nombres que uses, mientras coincidan con
   lo que pongas en `ARCA_CERT_PATH`/`ARCA_KEY_PATH` del paso siguiente).
   **No borres los de homologación** hasta estar seguro — se puede volver
   atrás cambiando el `.env` de nuevo.
2. Editar `C:\Ferreteria\.env` (el real, el que usa el servicio) y
   cambiar, en este orden:
   - `EMISOR_CUIT` → CUIT de la empresa.
   - `EMISOR_PUNTO_VENTA` → el punto de venta real de producción.
   - `ARCA_CERT_PATH` / `ARCA_KEY_PATH` → apuntando a los certificados de
     producción copiados en el paso 1.
   - `ARCA_AMBIENTE=produccion` — este es el último valor a cambiar, y
     recién cuando los tres de arriba ya estén correctos y verificados.
3. Reiniciar el servicio para que tome el `.env` nuevo (la carga de
   certificados es perezosa para facturar, pero `ARCA_AMBIENTE` y el CUIT
   se leen al construir el `Emisor`, que sí necesita reiniciar el
   proceso):
   ```
   nssm restart FerreteriaBackend
   ```
4. **Primera factura real: monto chico.** Facturá algo de poco valor desde
   el sistema (una ficha con una línea de unos pocos pesos) y verificala en
   el portal de ARCA, sección **"Mis Comprobantes"**, antes de seguir
   facturando con normalidad. Si algo salió mal (comprobante no aparece,
   CAE inválido), es mucho más fácil de resolver con un monto chico que con
   una venta real grande.

### Volver atrás

Si algo sale mal después de pasar a producción, revertir es el mismo
`.env` al revés: `ARCA_AMBIENTE=homologacion`, `EMISOR_CUIT` y
`EMISOR_PUNTO_VENTA` de vuelta a los de homologación, `ARCA_CERT_PATH`/
`ARCA_KEY_PATH` de vuelta a `homologacion.crt`/`homologacion.key`, y
`nssm restart FerreteriaBackend`. Una factura ya emitida en producción con
CAE real no se puede "deshacer" (no es una operación de este sistema): si
hace falta anularla, es la Nota de Crédito de siempre, en producción.

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
noches. Acá no hay wizard que pregunte los destinos (eso es del instalador,
sección 1): completar `BACKUP_DIR_LOCAL`, `BACKUP_PENDRIVE_LABEL` y
`BACKUP_DIR_DRIVE` a mano en el `.env` — ver "Configurar los destinos de
backup" en la sección 1 más arriba para cómo etiquetar el pendrive e
instalar Google Drive.

1. Abrir el Programador de tareas (`taskschd.msc`) → "Crear tarea".
2. **General**: nombre "FerreteriaBackup". Tildar "Ejecutar tanto si el
   usuario inició sesión como si no".
3. **Desencadenadores** → Nuevo → "Diariamente", horario sugerido 19:00 (o
   cualquier hora en que la PC quede prendida y sin uso).
4. **Acciones** → Nueva → Programa/script:
   `C:\ruta\a\sistema-local\backend\ejecutar-backup.bat` (ruta completa;
   igual que en el paso A5, el `.bat` se ubica solo).

Equivalente por línea de comandos (solo trigger diario — el instalador
automático usa PowerShell para agregar el trigger de inicio del sistema
también, ver `registrar-tarea-backup.ps1`):

```
schtasks /create /tn "FerreteriaBackup" /tr "C:\ruta\a\sistema-local\backend\ejecutar-backup.bat" /sc daily /st 19:00 /ru SYSTEM
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
