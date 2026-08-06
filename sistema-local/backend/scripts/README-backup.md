# Backup y restore

`scripts/backup.ts` es standalone: no depende de que el backend esté
corriendo (conexión propia a Postgres, sin pasar por los Gestores de la app).
Cuando se instala con el `.exe`, la tarea programada de Windows lo corre
automáticamente (ver más abajo). También se puede correr a mano.

## Cómo correrlo

Desde `sistema-local/backend/`, con el `.env` completo (ver `.env.example` —
sección "Backup"):

```bash
npm run backup
```

Variables de entorno relevantes (además de las `DB_*` que ya usa la app):

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `BACKUP_DIR_LOCAL` | **Sí** | Carpeta en esta PC. Siempre se escribe acá primero. |
| `BACKUP_PENDRIVE_LABEL` | No | Etiqueta del volumen del pendrive de backup (ej. `BACKUP_FERRE`) — la letra de unidad se resuelve en cada corrida con `Get-Volume`, así que funciona en cualquier puerto USB sin importar qué letra le toque esa vez. Ver "Etiquetar el pendrive" en `docs/INSTALACION.md`. Si el pendrive no está conectado (o no tiene esa etiqueta), se salta con un WARNING — no rompe el resto. |
| `BACKUP_DIR_PENDRIVE` | No | Forma vieja: ruta fija (ej. `D:\Backups`). Sigue soportada como fallback/override manual si `BACKUP_PENDRIVE_LABEL` no está o no resuelve — si las dos están seteadas, se intenta primero la etiqueta. |
| `BACKUP_DIR_DRIVE` | No | Carpeta local que sincroniza el cliente de escritorio de Google Drive (no es la API de Drive). Requiere tenerlo instalado y con sesión iniciada — ver `docs/INSTALACION.md`. |
| `PG_DUMP_PATH` | No | Ruta al ejecutable de `pg_dump` si no está en el `PATH` del sistema. |

El instalador (`installer/ferreteria.iss`) pide `BACKUP_DIR_LOCAL` (obligatorio)
y `BACKUP_PENDRIVE_LABEL`/`BACKUP_DIR_DRIVE` (opcionales) en una página del
wizard y los escribe directo al `.env` — no hace falta tocar nada a mano en
una instalación nueva. Para cambiarlos después hay dos caminos, ambos sin
reinstalar: la pantalla **Configuración de backup** del sistema (guarda en la
tabla `config_backup` de la DB y es la que manda) o, más a mano, editar el
`.env` en la carpeta de instalación (se usa como fallback si la DB no tiene
esa clave seteada). El script lee la config en cada corrida, no al arrancar
el servicio.

## Tarea programada (instalación automática)

El instalador `.exe` crea una tarea de Windows con **dos triggers**:

1. **Diario a las 19:00** — si la PC está prendida, corre ahí.
2. **Al inicio del sistema** (con 10 minutos de delay) — si la PC estaba
   apagada a las 19:00, corre cuando se prende al otro día. El delay da
   tiempo a que la base de datos arranque (el backup corre directo contra
   Postgres; no depende del servicio del backend).

Si la PC está apagada varios días, cada vez que se prende corre el backup
del día (uno solo — no acumula los días que faltan, porque `backup.ts` usa
la fecha de hoy para los nombres de archivo).

La tarea se registra con `Register-ScheduledTask` (PowerShell) y tiene
fallback a `schtasks` si PowerShell no está disponible. Se ejecuta como
`SYSTEM` con privilegios elevados.

Para verificar: `schtasks /query /tn "FerreteriaBackup"`.
Para correr manualmente: `schtasks /run /tn "FerreteriaBackup"`.

## Qué genera

En `BACKUP_DIR_LOCAL` (y copia idéntica a `BACKUP_DIR_PENDRIVE`/`BACKUP_DIR_DRIVE`
si están configurados y disponibles), con fecha en el nombre — nunca
sobrescribe el de un día anterior:

- `dump_AAAA-MM-DD.sql` — `pg_dump` completo (formato plano). Restaura TODO.
- `saldos_AAAA-MM-DD.csv` — clientes con saldo > 0: razón social, teléfono, saldo.
- `fichas_abiertas_AAAA-MM-DD.csv` — **el más crítico**: fichas ABIERTA con
  sus líneas (una fila por línea, cliente repetido). Es lo que el titular
  necesita para poder facturar el mes a mano si se pierde el sistema.
- `clientes_AAAA-MM-DD.csv` — razón social, doc tipo/nro, condición IVA,
  domicilio, teléfono, email.
- `caja_AAAA-MM-DD.csv` — movimientos de caja del día sin cerrar + el
  historial de cierres (fecha, total, desglose por medio de pago).

Los montos en los CSV van con punto decimal simple (`1234.56`, no
`1.234,56`): una coma decimal al estilo es-AR chocaría con la coma que separa
columnas.

Se retienen 30 días por destino; se borran los más viejos **solo** en un
destino donde el backup de HOY se haya escrito bien (si hoy falló, no se
borra nada ahí — un fallo repetido no te puede dejar sin ninguna copia). El
resultado de cada corrida (qué se generó, qué destino falló, cuántos archivos
se retuvieron/borraron) queda en `BACKUP_DIR_LOCAL/backup.log`.

## Que un fallo no quede silencioso

`backup.log` es detallado pero nadie lo lee todos los días — un pendrive
desconectado quedaba como un WARNING ahí y un backup degradado a "solo
local" no protege del escenario principal (que se muera el disco de la PC).
Por eso cada corrida:

- Termina con **exit code != 0** si el dump o los CSVs fallan → la tarea
  programada de Windows reintenta (`RestartCount`/`StartWhenAvailable`) y el
  fallo queda registrado, no pasa en silencio.
- **Registra la ejecución en la tabla `ejecuciones_backup`** de la DB (la
  misma que lee la pantalla de historial y la alerta del frontend), con el
  resultado por destino (LOCAL/PENDRIVE/DRIVE) y el log completo.
- Actualiza `BACKUP_DIR_LOCAL/estado-backup.json` con la fecha del **último
  backup EXITOSO por destino** — histórico, para diagnóstico rápido.

El frontend muestra un aviso discreto en la barra superior si hace más de 3
días que no hay una copia exitosa en **ningún destino externo** (pendrive o
Drive) — el backup local solo no cuenta para esta alerta, a propósito. La
alerta la sirve `GET /api/backup/estado` del backend, que lee
`ejecuciones_backup` (por eso el backup nocturno también queda registrado
ahí, aunque no pase por el API).

## RESTORE — procedimiento paso a paso

**Importante: esto hay que probarlo al menos una vez antes de pasar a
producción.** Un backup que nunca se restauró no es un backup — se prueba
ahora, tranquilo, no el día que se necesita de verdad.

**Necesitás el superusuario de Postgres, no `ferreteria_app`.** `ferreteria_app`
es dueño de su base pero no tiene `CREATEDB` — el paso 1 de abajo (crear la
base) tiene que hacerlo el superusuario. Si el sistema se instaló con el
instalador `.exe` (`ferreteria.iss`) y Postgres se instaló desde cero en esa
instalación, la contraseña del superusuario es aleatoria y quedó guardada en
`PG_SUPERUSER_PASSWORD` dentro del `.env` de esa PC (y se mostró una sola vez
en pantalla al terminar la instalación, para anotarla aparte). Si ese `.env`
también se perdió, no queda con qué conectarse como superusuario — hay que
resetear la contraseña de `postgres` a mano (requiere acceso admin a Windows
en esa PC) antes de poder restaurar.

1. Crear una base vacía (usar un nombre de prueba si estás validando el
   procedimiento, no el de producción):

   ```bash
   psql -h localhost -U postgres -c "CREATE DATABASE ferreteria_restore_test;"
   ```

2. Restaurar el dump (es SQL plano — se aplica con `psql`, no con
   `pg_restore`, que es para el formato custom/`-Fc`):

   ```bash
   psql -h localhost -U postgres -d ferreteria_restore_test -f dump_AAAA-MM-DD.sql
   ```

3. Verificar que entró todo:

   ```bash
   psql -h localhost -U postgres -d ferreteria_restore_test -c "SELECT count(*) FROM clientes;"
   psql -h localhost -U postgres -d ferreteria_restore_test -c "SELECT count(*) FROM ventas WHERE estado = 'ABIERTA';"
   ```

   Comparar esos números contra lo que dice `clientes_AAAA-MM-DD.csv` /
   `fichas_abiertas_AAAA-MM-DD.csv` del mismo día.

4. Si es una restauración real (no una prueba): apuntar `DB_NAME` del `.env`
   del backend a la base restaurada (o renombrarla al nombre de producción
   una vez confirmado que la base original está perdida) y levantar la app.

5. Si el sistema entero desapareció (PC rota, no hay ni Postgres): instalar
   PostgreSQL, crear la base con el mismo `DB_NAME` del `.env`, y repetir los
   pasos 2-4. Mientras tanto, `fichas_abiertas_AAAA-MM-DD.csv` y
   `saldos_AAAA-MM-DD.csv` son legibles sin el sistema (se abren con
   cualquier planilla o desde el celular) — con eso el titular puede seguir
   facturando el mes a mano.

### Troubleshooting

- `pg_dump`/`psql` "no se reconoce como un comando": no están en el `PATH`
  de Windows. Se encuentran típicamente en
  `C:\Program Files\PostgreSQL\<versión>\bin\`. Para `backup.ts`, configurar
  `PG_DUMP_PATH` en el `.env`. Para restaurar a mano, usar la ruta completa a
  `psql.exe` o agregar esa carpeta al `PATH`.
- Postgres 18+: el dump arranca con `\restrict <token>` y termina con
  `\unrestrict <token>` (meta-comandos de `psql`, no SQL — es una medida de
  seguridad nueva de `pg_dump`, no hay flag para desactivarla). Si restaurás
  con un `psql` **más viejo** que no los reconoce, va a mostrar algo como
  "Invalid command \restrict" y seguir de largo — es solo un warning, no
  corta la restauración. Igual, mejor usar un `psql` de versión igual o más
  nueva que la que generó el dump cuando se pueda.
