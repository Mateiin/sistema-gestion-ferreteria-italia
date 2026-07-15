# Backup y restore

`scripts/backup.ts` es standalone: no depende de que el backend esté
corriendo (conexión propia a Postgres, sin pasar por los Gestores de la app)
ni de un docker-compose (no existe todavía en este proyecto). Corre a mano
por ahora — la programación horaria (cron / tarea programada de Windows /
contenedor en un futuro Compose) queda pendiente para cuando el sistema se
despliegue en la PC del local.

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
| `BACKUP_DIR_PENDRIVE` | No | Si el path no existe o el pendrive no está conectado, se salta con un WARNING — no rompe el resto. |
| `BACKUP_DIR_DRIVE` | No | Carpeta local que sincroniza el cliente de escritorio de Google Drive (no es la API de Drive). |
| `PG_DUMP_PATH` | No | Ruta al ejecutable de `pg_dump` si no está en el `PATH` del sistema. |

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

## RESTORE — procedimiento paso a paso

**Importante: esto hay que probarlo al menos una vez antes de pasar a
producción.** Un backup que nunca se restauró no es un backup — se prueba
ahora, tranquilo, no el día que se necesita de verdad.

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
