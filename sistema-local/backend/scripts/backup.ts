import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client, types } from 'pg';

/**
 * Backup standalone del sistema local: NO depende de que la app esté
 * corriendo (conexión propia a Postgres, sin pasar por los Gestores del
 * backend) ni de un docker-compose (no existe todavía — corre a mano hasta
 * que se cablee un cron/tarea programada en el despliegue). Ver
 * `scripts/README-backup.md` para el procedimiento de restore.
 *
 * Genera, con fecha en el nombre (nunca sobrescribe):
 *   dump_AAAA-MM-DD.sql, saldos_AAAA-MM-DD.csv, fichas_abiertas_AAAA-MM-DD.csv,
 *   clientes_AAAA-MM-DD.csv, caja_AAAA-MM-DD.csv
 * a BACKUP_DIR_LOCAL (obligatorio) y copia esos mismos archivos al pendrive
 * (resuelto por BACKUP_PENDRIVE_LABEL, la etiqueta del volumen -- o por
 * BACKUP_DIR_PENDRIVE, una ruta fija, como fallback viejo) y a
 * BACKUP_DIR_DRIVE (opcionales, tolerantes a fallo). También escribe
 * BACKUP_DIR_LOCAL/estado-backup.json con la fecha del último backup
 * EXITOSO por destino, para que un fallo no quede silencioso en un log que
 * nadie lee (lo consume GET /api/backup/estado del backend).
 */

const execFileAsync = promisify(execFile);

const RETENCION_DIAS = 30;

// DATE de Postgres sin conversión de huso horario: por default node-postgres
// lo devuelve como `Date` a medianoche UTC, y convertirlo con getters locales
// en Argentina (UTC-3) lo corre un día para atrás — mismo gotcha ya pisado en
// `movimiento-caja.entity.ts`. Con esto viaja tal cual el string 'AAAA-MM-DD'
// que ya está guardado, sin tocar nada.
types.setTypeParser(1082 /* date */, (valor) => valor);

// ---------------------------------------------------------------------------
// Fecha/hora local (Argentina) — NUNCA toISOString()/UTC para el nombre del
// backup ni para leer columnas `timestamp`.
// ---------------------------------------------------------------------------

function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function formatearFecha(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function formatearHora(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Log: a consola y, al final, apendeado a backup.log en BACKUP_DIR_LOCAL.
// ---------------------------------------------------------------------------

const logs: string[] = [];

function log(nivel: 'INFO' | 'WARNING' | 'ERROR', mensaje: string): void {
  const linea = `[${fechaHoy()} ${formatearHora(new Date())}] ${nivel}: ${mensaje}`;
  logs.push(linea);
  (nivel === 'ERROR' ? console.error : console.log)(linea);
}

// ---------------------------------------------------------------------------
// CSV: separador coma, monto en punto decimal simple (una coma decimal es-AR
// chocaría con el separador de campo), texto entre comillas si hace falta.
// ---------------------------------------------------------------------------

function csvEscape(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filaCsv(valores: unknown[]): string {
  return valores.map(csvEscape).join(',') + '\n';
}

function formatearMonto(valor: unknown): string {
  return Number(valor).toFixed(2);
}

// ---------------------------------------------------------------------------
// Config de conexión — MISMAS variables DB_* que usa la app (ver AppModule /
// data-source.ts), para que el backup pegue siempre a la base correcta.
// ---------------------------------------------------------------------------

interface ConfigDb {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function leerConfigDb(): ConfigDb {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'ferreteria_local',
  };
}

// ---------------------------------------------------------------------------
// Dump completo (pg_dump) + verificación.
// ---------------------------------------------------------------------------

async function generarDump(
  config: ConfigDb,
  destino: string,
): Promise<{ ok: boolean; tamanioBytes: number }> {
  // No en PATH en todas las PCs (ver README-backup.md): configurable por env.
  const pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
  try {
    await execFileAsync(
      pgDumpPath,
      [
        '-h', config.host,
        '-p', String(config.port),
        '-U', config.user,
        '-d', config.database,
        '-F', 'p',
        '-f', destino,
        '--no-password',
      ],
      // La contraseña va por env, no como argumento (no queda visible en la
      // lista de procesos del sistema operativo).
      { env: { ...process.env, PGPASSWORD: config.password } },
    );
  } catch (err) {
    log('ERROR', `pg_dump falló (¿PG_DUMP_PATH mal configurado o credenciales inválidas?): ${(err as Error).message}`);
    return { ok: false, tamanioBytes: 0 };
  }

  if (!fs.existsSync(destino)) {
    log('ERROR', 'pg_dump terminó sin generar el archivo esperado');
    return { ok: false, tamanioBytes: 0 };
  }

  const tamanioBytes = fs.statSync(destino).size;
  if (tamanioBytes === 0) {
    log('ERROR', 'El dump se generó vacío (0 bytes)');
    return { ok: false, tamanioBytes };
  }

  // pg_dump en formato plano termina siempre con este comentario cuando
  // completó sin cortarse a mitad de camino.
  const fd = fs.openSync(destino, 'r');
  const bufferFinal = Buffer.alloc(Math.min(500, tamanioBytes));
  fs.readSync(fd, bufferFinal, 0, bufferFinal.length, tamanioBytes - bufferFinal.length);
  fs.closeSync(fd);
    if (!bufferFinal.toString('utf-8').includes('-- PostgreSQL database dump complete')) {
      log('ERROR', 'El dump no tiene el marcador de finalización de pg_dump — puede haber quedado truncado');
      return { ok: false, tamanioBytes };
    }

    log('INFO', `Dump verificado OK (${(tamanioBytes / 1024).toFixed(1)} KB)`);
    return { ok: true, tamanioBytes };
}

// ---------------------------------------------------------------------------
// CSVs — SQL directo contra la base (no reusan los Gestores: tienen que
// poder correr aunque el backend esté caído).
// ---------------------------------------------------------------------------

async function generarSaldosCsv(client: Client, destino: string): Promise<number> {
  const { rows } = await client.query(`
    SELECT c."razonSocial" AS razon_social, c.telefono,
      COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.monto::numeric ELSE -m.monto::numeric END), 0) AS saldo
    FROM clientes c
    JOIN movimientos_cta_cte m ON m."clienteId" = c.id
    GROUP BY c.id, c."razonSocial", c.telefono
    HAVING COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.monto::numeric ELSE -m.monto::numeric END), 0) > 0
    ORDER BY c."razonSocial"
  `);

  let contenido = filaCsv(['razonSocial', 'telefono', 'saldo']);
  for (const fila of rows) {
    contenido += filaCsv([fila.razon_social, fila.telefono ?? '', formatearMonto(fila.saldo)]);
  }
  fs.writeFileSync(destino, contenido, 'utf-8');
  return rows.length;
}

async function generarFichasAbiertasCsv(client: Client, destino: string): Promise<number> {
  // LEFT JOIN a propósito: una ficha ABIERTA sin líneas todavía también tiene
  // que aparecer (el cliente la abrió, es dato en curso).
  const { rows } = await client.query(`
    SELECT
      c."razonSocial" AS cliente,
      v."createdAt" AS fecha_apertura,
      lv.descripcion,
      lv.cantidad,
      lv."precioUnitario" AS precio_unitario,
      lv."ivaPorcentaje" AS iva_porcentaje,
      lv.cantidad::numeric * lv."precioUnitario"::numeric AS subtotal,
      (
        SELECT COALESCE(SUM(lv2.cantidad::numeric * lv2."precioUnitario"::numeric), 0)
        FROM lineas_venta lv2
        WHERE lv2."ventaId" = v.id
      ) AS total_ficha
    FROM ventas v
    JOIN clientes c ON c.id = v."clienteId"
    LEFT JOIN lineas_venta lv ON lv."ventaId" = v.id
    WHERE v.estado = 'ABIERTA'
    ORDER BY c."razonSocial", v."createdAt", lv."createdAt"
  `);

  let contenido = filaCsv([
    'cliente', 'fechaApertura', 'descripcion', 'cantidad',
    'precioUnitarioNeto', 'ivaPorcentaje', 'subtotal', 'totalFicha',
  ]);
  for (const fila of rows) {
    contenido += filaCsv([
      fila.cliente,
      formatearFecha(fila.fecha_apertura),
      fila.descripcion ?? '(ficha sin líneas)',
      fila.cantidad ?? '',
      fila.precio_unitario !== null ? formatearMonto(fila.precio_unitario) : '',
      fila.iva_porcentaje ?? '',
      fila.subtotal !== null ? formatearMonto(fila.subtotal) : '',
      formatearMonto(fila.total_ficha),
    ]);
  }
  fs.writeFileSync(destino, contenido, 'utf-8');
  return rows.length;
}

async function generarClientesCsv(client: Client, destino: string): Promise<number> {
  const { rows } = await client.query(`
    SELECT "razonSocial" AS razon_social, "docTipo" AS doc_tipo, "docNro" AS doc_nro,
      "condicionIva" AS condicion_iva, domicilio, telefono, email
    FROM clientes
    ORDER BY "razonSocial"
  `);

  let contenido = filaCsv(['razonSocial', 'docTipo', 'docNro', 'condicionIva', 'domicilio', 'telefono', 'email']);
  for (const fila of rows) {
    contenido += filaCsv([
      fila.razon_social,
      fila.doc_tipo,
      fila.doc_nro,
      fila.condicion_iva,
      fila.domicilio ?? '',
      fila.telefono ?? '',
      fila.email ?? '',
    ]);
  }
  fs.writeFileSync(destino, contenido, 'utf-8');
  return rows.length;
}

async function generarCajaCsv(client: Client, destino: string): Promise<number> {
  const movimientos = await client.query(`
    SELECT fecha, "createdAt" AS creado, tipo, descripcion, "medioPago" AS medio_pago, monto
    FROM movimientos_caja
    WHERE "cierreId" IS NULL
    ORDER BY fecha, "createdAt"
  `);
  const cierres = await client.query(`
    SELECT fecha, "montoTotal" AS total, "montoEfectivo" AS efectivo,
      "montoTransferencia" AS transferencia, "montoTarjeta" AS tarjeta, "montoOtro" AS otro
    FROM cierres_caja
    ORDER BY fecha DESC
  `);

  let contenido = '=== MOVIMIENTOS ABIERTOS (sin cerrar) ===\n';
  contenido += filaCsv(['fecha', 'hora', 'tipo', 'descripcion', 'medioPago', 'monto']);
  for (const fila of movimientos.rows) {
    contenido += filaCsv([
      fila.fecha,
      formatearHora(fila.creado),
      fila.tipo,
      fila.descripcion ?? '',
      fila.medio_pago,
      formatearMonto(fila.monto),
    ]);
  }

  contenido += '\n=== CIERRES (arqueos) ===\n';
  contenido += filaCsv(['fecha', 'total', 'efectivo', 'transferencia', 'tarjeta', 'otro']);
  for (const fila of cierres.rows) {
    contenido += filaCsv([
      fila.fecha,
      formatearMonto(fila.total),
      formatearMonto(fila.efectivo),
      formatearMonto(fila.transferencia),
      formatearMonto(fila.tarjeta),
      formatearMonto(fila.otro),
    ]);
  }

  fs.writeFileSync(destino, contenido, 'utf-8');
  return movimientos.rows.length + cierres.rows.length;
}

// ---------------------------------------------------------------------------
// Destinos: local (obligatorio, ya se escribió directo ahí) + pendrive/drive
// (opcionales, copia tolerante a fallo — un destino roto no aborta el resto).
// ---------------------------------------------------------------------------

interface ResultadoDestino {
  nombre: string;
  estado: 'ok' | 'omitido' | 'error';
  detalle?: string;
}

// ---------------------------------------------------------------------------
// Pendrive: resuelto por ETIQUETA de volumen (Get-Volume), no por letra fija
// -- así funciona en cualquier puerto USB, sin importar qué letra le toque
// esta vez. BACKUP_DIR_PENDRIVE (ruta fija, el mecanismo viejo) se sigue
// soportando como fallback/override manual si la etiqueta no está
// configurada o no resuelve (pendrive desconectado, mal etiquetado).
// ---------------------------------------------------------------------------

const CARPETA_EN_PENDRIVE = 'FerreteriaBackups';

async function resolverLetraPorEtiqueta(etiqueta: string): Promise<string | null> {
  // Comilla simple duplicada: forma de escapar una comilla simple DENTRO de
  // un string de PowerShell entre comillas simples (no hay backslash-escape ahí).
  const etiquetaEscapada = etiqueta.replace(/'/g, "''");
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-Volume -FileSystemLabel '${etiquetaEscapada}' -ErrorAction Stop).DriveLetter`,
    ]);
    const letra = stdout.trim();
    return letra || null;
  } catch {
    // No existe ningún volumen con esa etiqueta ahora mismo -- lo más común
    // es que el pendrive esté desconectado. No es un error, es "omitido".
    return null;
  }
}

async function resolverDirPendrive(): Promise<string | undefined> {
  const etiqueta = process.env.BACKUP_PENDRIVE_LABEL;
  const rutaFija = process.env.BACKUP_DIR_PENDRIVE;

  if (etiqueta) {
    const letra = await resolverLetraPorEtiqueta(etiqueta);
    if (letra) return `${letra}:\\${CARPETA_EN_PENDRIVE}`;
    log('WARNING', `Pendrive con etiqueta "${etiqueta}" no encontrado (¿está conectado? ¿tiene puesta esa etiqueta?)`);
  }

  return rutaFija;
}

function copiarADestino(nombre: string, dirDestino: string | undefined, archivos: string[]): ResultadoDestino {
  if (!dirDestino) {
    return { nombre, estado: 'omitido', detalle: 'no configurado (variable de entorno vacía)' };
  }

  try {
    // mkdir recursive también sirve de chequeo de "¿está montado?": si el
    // pendrive no está conectado, la letra de unidad ni existe y esto tira
    // ENOENT — lo tratamos como "omitido", no como error fatal.
    fs.mkdirSync(dirDestino, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const motivo = code === 'ENOENT'
      ? `no está conectado/montado (${dirDestino})`
      : (err as Error).message;
    return { nombre, estado: 'omitido', detalle: motivo };
  }

  try {
    for (const archivo of archivos) {
      fs.copyFileSync(archivo, path.join(dirDestino, path.basename(archivo)));
    }
    return { nombre, estado: 'ok' };
  } catch (err) {
    return { nombre, estado: 'error', detalle: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Estado del backup: para que un fallo NO sea silencioso. Antes, si el
// pendrive no estaba, quedaba un WARNING en backup.log que nadie lee y el
// script terminaba con exit 0 -- un backup degradado a "solo local" no
// protege del escenario principal (se muere el disco de la PC). Acá se
// persiste, por destino, la fecha del último backup EXITOSO (no solo del
// último intento): lo lee GET /api/backup/estado en el backend para avisar
// en el frontend si hace varios días que no hay copia externa, sin que
// nadie tenga que ir a leer este log a mano.
// ---------------------------------------------------------------------------

const NOMBRE_ARCHIVO_ESTADO = 'estado-backup.json';

interface EstadoDestino {
  ultimoExitoso: string | null;
  ultimoIntento: string | null;
  ultimoResultado: 'ok' | 'omitido' | 'error' | null;
  detalle?: string;
}

interface EstadoBackup {
  destinos: Record<'LOCAL' | 'PENDRIVE' | 'DRIVE', EstadoDestino>;
}

function estadoDestinoVacio(): EstadoDestino {
  return { ultimoExitoso: null, ultimoIntento: null, ultimoResultado: null };
}

function leerEstadoPrevio(rutaEstado: string): EstadoBackup {
  try {
    const parseado = JSON.parse(fs.readFileSync(rutaEstado, 'utf-8')) as Partial<EstadoBackup>;
    return {
      destinos: {
        LOCAL: parseado.destinos?.LOCAL ?? estadoDestinoVacio(),
        PENDRIVE: parseado.destinos?.PENDRIVE ?? estadoDestinoVacio(),
        DRIVE: parseado.destinos?.DRIVE ?? estadoDestinoVacio(),
      },
    };
  } catch {
    // Primera corrida del sistema, o el archivo quedó corrupto/a medio
    // escribir -- se arranca de cero en vez de romper el backup por esto.
    return {
      destinos: { LOCAL: estadoDestinoVacio(), PENDRIVE: estadoDestinoVacio(), DRIVE: estadoDestinoVacio() },
    };
  }
}

function actualizarEstado(previo: EstadoBackup, resultados: ResultadoDestino[], hoy: string): EstadoBackup {
  const nuevo: EstadoBackup = { destinos: { ...previo.destinos } };
  for (const r of resultados) {
    const nombre = r.nombre as keyof EstadoBackup['destinos'];
    const anterior = previo.destinos[nombre] ?? estadoDestinoVacio();
    nuevo.destinos[nombre] = {
      ultimoExitoso: r.estado === 'ok' ? hoy : anterior.ultimoExitoso,
      ultimoIntento: hoy,
      ultimoResultado: r.estado,
      detalle: r.detalle,
    };
  }
  return nuevo;
}

function guardarEstado(dirLocal: string, estado: EstadoBackup): void {
  fs.writeFileSync(path.join(dirLocal, NOMBRE_ARCHIVO_ESTADO), JSON.stringify(estado, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hoy = new Date();
  const hoyStr = fechaHoy();
  const hh = String(hoy.getHours()).padStart(2, '0');
  const mm = String(hoy.getMinutes()).padStart(2, '0');
  const ss = String(hoy.getSeconds()).padStart(2, '0');
  const sufijoFechaHora = `${hoyStr}_${hh}.${mm}.${ss}`;
  const carpetaEjecucion = `backup_${sufijoFechaHora}`;

  const dirLocal = process.env.BACKUP_DIR_LOCAL;
  if (!dirLocal) {
    console.error('BACKUP_DIR_LOCAL no está definida (es obligatoria). Revisá el .env — ver .env.example.');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(dirLocal, { recursive: true });

  const dirDestinoLocal = path.join(dirLocal, carpetaEjecucion);
  fs.mkdirSync(dirDestinoLocal, { recursive: true });

  log('INFO', `Backup del ${hoyStr} — iniciando (carpeta: ${carpetaEjecucion})`);

  const config = leerConfigDb();

  // 1) Dump completo.
  const rutaDump = path.join(dirDestinoLocal, `dump_${hoyStr}.sql`);
  const resultadoDump = await generarDump(config, rutaDump);

  // 2) CSVs.
  const rutaSaldos = path.join(dirDestinoLocal, `saldos_${hoyStr}.csv`);
  const rutaFichas = path.join(dirDestinoLocal, `fichas_abiertas_${hoyStr}.csv`);
  const rutaClientes = path.join(dirDestinoLocal, `clientes_${hoyStr}.csv`);
  const rutaCaja = path.join(dirDestinoLocal, `caja_${hoyStr}.csv`);

  let csvsOk = true;
  const client = new Client(config);
  try {
    await client.connect();
    const filasSaldos = await generarSaldosCsv(client, rutaSaldos);
    log('INFO', `saldos_${hoy}.csv generado (${filasSaldos} cliente(s) con saldo pendiente)`);
    const filasFichas = await generarFichasAbiertasCsv(client, rutaFichas);
    log('INFO', `fichas_abiertas_${hoy}.csv generado (${filasFichas} línea(s))`);
    const filasClientes = await generarClientesCsv(client, rutaClientes);
    log('INFO', `clientes_${hoy}.csv generado (${filasClientes} cliente(s))`);
    const filasCaja = await generarCajaCsv(client, rutaCaja);
    log('INFO', `caja_${hoy}.csv generado (${filasCaja} fila(s))`);
  } catch (err) {
    csvsOk = false;
    log('ERROR', `Falló la generación de algún CSV: ${(err as Error).message}`);
  } finally {
    await client.end();
  }

  // 3) Destinos — copiar la carpeta entera.
  const dirPendrive = await resolverDirPendrive();
  const copiarCarpeta = (nombre: string, dirDestino: string | undefined): ResultadoDestino => {
    if (!dirDestino) return { nombre, estado: 'omitido', detalle: 'no configurado' };
    try {
      fs.mkdirSync(dirDestino, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { nombre, estado: 'omitido', detalle: code === 'ENOENT' ? `no está montado (${dirDestino})` : (err as Error).message };
    }
    try {
      fs.cpSync(dirDestinoLocal, path.join(dirDestino, carpetaEjecucion), { recursive: true });
      return { nombre, estado: 'ok' };
    } catch (err) {
      return { nombre, estado: 'error', detalle: (err as Error).message };
    }
  };
  const resultados: ResultadoDestino[] = [
    { nombre: 'LOCAL', estado: resultadoDump.ok && csvsOk ? 'ok' : 'error' },
    copiarCarpeta('PENDRIVE', dirPendrive),
    copiarCarpeta('DRIVE', process.env.BACKUP_DIR_DRIVE),
  ];

  for (const r of resultados) {
    if (r.estado === 'ok') log('INFO', `Destino ${r.nombre}: OK`);
    else if (r.estado === 'omitido') log('WARNING', `Destino ${r.nombre}: omitido — ${r.detalle}`);
    else log('WARNING', `Destino ${r.nombre}: FALLÓ — ${r.detalle}`);
  }

  // 3b) Estado persistido — ver "Estado del backup" arriba: esto es lo que
  // lee el backend para poder avisar en el frontend si hace días que no hay
  // copia externa, en vez de que quede solo como un WARNING en este log.
  const estadoPrevio = leerEstadoPrevio(path.join(dirLocal, NOMBRE_ARCHIVO_ESTADO));
  guardarEstado(dirLocal, actualizarEstado(estadoPrevio, resultados, hoy));

  // 4) Retención — solo en destinos donde el backup de HOY quedó OK.
  const dirPorDestino: Record<string, string | undefined> = {
    LOCAL: dirLocal,
    PENDRIVE: dirPendrive,
    DRIVE: process.env.BACKUP_DIR_DRIVE,
  };
  const patronCarpeta = /^backup_(\d{4}-\d{2}-\d{2})_\d{2}\.\d{2}\.\d{2}$/;
  for (const r of resultados) {
    if (r.estado !== 'ok') continue;
    const dir = dirPorDestino[r.nombre];
    if (!dir) continue;
    const limite = new Date(hoyStr);
    limite.setDate(limite.getDate() - RETENCION_DIAS);
    let borrados = 0;
    try {
      for (const entrada of fs.readdirSync(dir)) {
        const match = entrada.match(patronCarpeta);
        if (!match) continue;
        if (new Date(match[1]) < limite) {
          fs.rmSync(path.join(dir, entrada), { recursive: true, force: true });
          borrados++;
        }
      }
    } catch {
      // si no se puede leer el dir, no es crítico
    }
    if (borrados > 0) {
      log('INFO', `Retención en ${r.nombre}: ${borrados} carpeta(s) de más de ${RETENCION_DIAS} días borradas`);
    }
  }

  const huboErrorCritico = !resultadoDump.ok || !csvsOk;
  log(huboErrorCritico ? 'ERROR' : 'INFO', `Backup del ${hoy} finalizado ${huboErrorCritico ? 'CON ERRORES' : 'OK'}`);

  fs.appendFileSync(path.join(dirLocal, 'backup.log'), logs.join('\n') + '\n');

  if (huboErrorCritico) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Error inesperado en el script de backup:', err);
  process.exitCode = 1;
});
