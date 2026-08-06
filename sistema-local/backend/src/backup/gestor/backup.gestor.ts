import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client, types } from 'pg';
import { ConfigBackup } from '../modelo/config-backup.entity';
import { EjecucionBackup } from '../modelo/ejecucion-backup.entity';
import { ActualizarConfigBackupDto } from '../dto/actualizar-config-backup.dto';

const execFileAsync = promisify(execFile);

const RETENCION_DIAS = 30;
const MARCADOR_DUMP_OK = '-- PostgreSQL database dump complete';

// Mismo tratamiento que en el script original: DATE sin conversión de huso.
types.setTypeParser(1082, (valor) => valor);

const CLAVES_CONFIG = ['BACKUP_DIR_LOCAL', 'BACKUP_DIR_PENDRIVE', 'BACKUP_DIR_DRIVE'] as const;
type ClaveConfig = (typeof CLAVES_CONFIG)[number];

interface ResultadoDestino {
  nombre: string;
  estado: 'ok' | 'omitido' | 'error';
  detalle?: string;
}

function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function fechaHoraLocal(): { fecha: string; hora: string } {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return {
    fecha: `${d.getFullYear()}-${mes}-${dia}`,
    hora: `${hh}:${mm}:${ss}`,
  };
}

function formatearFecha(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function formatearMonto(valor: unknown): string {
  return Number(valor).toFixed(2);
}

function csvEscape(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filaCsv(valores: unknown[]): string {
  return valores.map(csvEscape).join(',') + '\n';
}

@Injectable()
export class BackupGestor {
  constructor(
    @InjectRepository(ConfigBackup)
    private readonly configRepo: Repository<ConfigBackup>,
    @InjectRepository(EjecucionBackup)
    private readonly ejecucionRepo: Repository<EjecucionBackup>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  async obtenerConfig(): Promise<Record<string, string>> {
    const filas = await this.configRepo.find();
    const resultado: Record<string, string> = {};
    for (const f of filas) {
      resultado[f.clave] = f.valor;
    }
    // Fallback al .env (lo que escribió el instalador): misma fuente que el
    // script standalone del backup nocturno. Una instalación nueva (tabla
    // config_backup vacía) no puede quedar sin backup por esto, y la pantalla
    // de Configuración muestra lo que realmente se va a usar.
    for (const clave of CLAVES_CONFIG) {
      if (!resultado[clave]) {
        const envValor = this.configService.get<string>(clave);
        if (envValor) resultado[clave] = envValor;
      }
    }
    return resultado;
  }

  async actualizarConfig(dto: ActualizarConfigBackupDto): Promise<Record<string, string>> {
    const entradas = Object.entries(dto).filter(([, v]) => v !== undefined) as [ClaveConfig, string][];

    if (entradas.length === 0) {
      return this.obtenerConfig();
    }

    // Validar que BACKUP_DIR_LOCAL sea obligatorio si se está seteando.
    const tieneLocal = entradas.find(([k]) => k === 'BACKUP_DIR_LOCAL');
    if (!tieneLocal) {
      // Si ya existe un valor guardado, ok. Si no, aceptar solo si el .env lo
      // tiene (fallback igual que obtenerConfig) — si no, rechazar.
      const actual = await this.configRepo.findOneBy({ clave: 'BACKUP_DIR_LOCAL' });
      const envLocal = this.configService.get<string>('BACKUP_DIR_LOCAL');
      if (!actual && !envLocal) {
        throw new ConflictException('BACKUP_DIR_LOCAL es obligatorio');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (const [clave, valor] of entradas) {
        const existente = await manager.findOne(ConfigBackup, { where: { clave } });
        if (existente) {
          existente.valor = valor;
          await manager.save(existente);
        } else {
          await manager.save(manager.create(ConfigBackup, { clave, valor }));
        }
      }
    });

    return this.obtenerConfig();
  }

  // ---------------------------------------------------------------------------
  // EJECUTAR BACKUP
  // ---------------------------------------------------------------------------

  async ejecutar(): Promise<EjecucionBackup> {
    const hoy = new Date();
    const config = await this.obtenerConfig();
    const dirLocal = config.BACKUP_DIR_LOCAL;
    if (!dirLocal) {
      throw new ConflictException('BACKUP_DIR_LOCAL no está configurado');
    }

    fs.mkdirSync(dirLocal, { recursive: true });

    const logs: string[] = [];
    const log = (nivel: string, mensaje: string) => {
      const linea = `[${fechaHoraLocal().fecha} ${fechaHoraLocal().hora}] ${nivel}: ${mensaje}`;
      logs.push(linea);
      (nivel === 'ERROR' ? console.error : console.log)(linea);
    };

    // Crear una subcarpeta por ejecución: backup_AAAA-MM-DD_HHmmss
    const sufijoFechaHora = `${hoy.toISOString().slice(0, 10)}_${String(hoy.getHours()).padStart(2, '0')}.${String(hoy.getMinutes()).padStart(2, '0')}.${String(hoy.getSeconds()).padStart(2, '0')}`;
    const carpetaEjecucion = `backup_${sufijoFechaHora}`;
    const dirDestinoLocal = path.join(dirLocal, carpetaEjecucion);
    fs.mkdirSync(dirDestinoLocal, { recursive: true });

    log('INFO', `Backup del ${hoy.toISOString().slice(0, 10)} — iniciando (carpeta: ${carpetaEjecucion})`);

    // 1) Dump
    const rutaDump = path.join(dirDestinoLocal, `dump_${hoy.toISOString().slice(0, 10)}.sql`);
    let bytesDump: number | null = null;
    let dumpOk = false;

    const configDb = this.leerConfigDb();
    const pgDumpPath = this.configService.get('PG_DUMP_PATH') || 'pg_dump';

    try {
      await execFileAsync(
        pgDumpPath,
        ['-h', configDb.host, '-p', String(configDb.port), '-U', configDb.user, '-d', configDb.database, '-F', 'p', '-f', rutaDump, '--no-password'],
        { env: { ...process.env, PGPASSWORD: configDb.password } },
      );
    } catch (err) {
      log('ERROR', `pg_dump falló: ${(err as Error).message}`);
    }

    if (fs.existsSync(rutaDump)) {
      const size = fs.statSync(rutaDump).size;
      if (size > 0) {
        // Verificar marcador
        const fd = fs.openSync(rutaDump, 'r');
        const buffer = Buffer.alloc(Math.min(500, size));
        fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
        fs.closeSync(fd);
        if (buffer.toString('utf-8').includes(MARCADOR_DUMP_OK)) {
          dumpOk = true;
          bytesDump = size;
          log('INFO', `Dump verificado OK (${(size / 1024).toFixed(1)} KB)`);
        } else {
          log('ERROR', 'El dump no tiene el marcador de finalización — puede estar truncado');
        }
      } else {
        log('ERROR', 'El dump se generó vacío (0 bytes)');
      }
    } else {
      log('ERROR', 'pg_dump terminó sin generar el archivo esperado');
    }

    // 2) CSVs
    const rutaSaldos = path.join(dirDestinoLocal, `saldos_${hoy.toISOString().slice(0, 10)}.csv`);
    const rutaFichas = path.join(dirDestinoLocal, `fichas_abiertas_${hoy.toISOString().slice(0, 10)}.csv`);
    const rutaClientes = path.join(dirDestinoLocal, `clientes_${hoy.toISOString().slice(0, 10)}.csv`);
    const rutaCaja = path.join(dirDestinoLocal, `caja_${hoy.toISOString().slice(0, 10)}.csv`);

    let csvsOk = true;
    const pgClient = new Client(configDb);
    try {
      await pgClient.connect();
      const { rows: saldos } = await pgClient.query(`
        SELECT c."razonSocial" AS razon_social, c.telefono,
          COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.monto::numeric ELSE -m.monto::numeric END), 0) AS saldo
        FROM clientes c
        JOIN movimientos_cta_cte m ON m."clienteId" = c.id
        GROUP BY c.id, c."razonSocial", c.telefono
        HAVING COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.monto::numeric ELSE -m.monto::numeric END), 0) > 0
        ORDER BY c."razonSocial"
      `);
      let contenido = filaCsv(['razonSocial', 'telefono', 'saldo']);
      for (const f of saldos) contenido += filaCsv([f.razon_social, f.telefono ?? '', formatearMonto(f.saldo)]);
      fs.writeFileSync(rutaSaldos, contenido, 'utf-8');
      log('INFO', `saldos.csv generado (${saldos.length} clientes)`);

      const { rows: fichas } = await pgClient.query(`
        SELECT c."razonSocial" AS cliente, v."createdAt" AS fecha_apertura,
          lv.descripcion, lv.cantidad, lv."precioUnitario" AS precio_unitario,
          lv."ivaPorcentaje" AS iva_porcentaje,
          lv.cantidad::numeric * lv."precioUnitario"::numeric AS subtotal,
          (SELECT COALESCE(SUM(lv2.cantidad::numeric * lv2."precioUnitario"::numeric), 0)
           FROM lineas_venta lv2 WHERE lv2."ventaId" = v.id) AS total_ficha
        FROM ventas v
        JOIN clientes c ON c.id = v."clienteId"
        LEFT JOIN lineas_venta lv ON lv."ventaId" = v.id
        WHERE v.estado = 'ABIERTA'
        ORDER BY c."razonSocial", v."createdAt", lv."createdAt"
      `);
      contenido = filaCsv(['cliente', 'fechaApertura', 'descripcion', 'cantidad', 'precioUnitarioNeto', 'ivaPorcentaje', 'subtotal', 'totalFicha']);
      for (const f of fichas) {
        contenido += filaCsv([
          f.cliente, formatearFecha(f.fecha_apertura), f.descripcion ?? '(ficha sin líneas)',
          f.cantidad ?? '', f.precio_unitario !== null ? formatearMonto(f.precio_unitario) : '',
          f.iva_porcentaje ?? '', f.subtotal !== null ? formatearMonto(f.subtotal) : '',
          formatearMonto(f.total_ficha),
        ]);
      }
      fs.writeFileSync(rutaFichas, contenido, 'utf-8');
      log('INFO', `fichas_abiertas.csv generado (${fichas.length} filas)`);

      const { rows: clientes } = await pgClient.query(`
        SELECT "razonSocial" AS razon_social, "docTipo" AS doc_tipo, "docNro" AS doc_nro,
          "condicionIva" AS condicion_iva, domicilio, telefono, email
        FROM clientes ORDER BY "razonSocial"
      `);
      contenido = filaCsv(['razonSocial', 'docTipo', 'docNro', 'condicionIva', 'domicilio', 'telefono', 'email']);
      for (const f of clientes) contenido += filaCsv([f.razon_social, f.doc_tipo, f.doc_nro, f.condicion_iva, f.domicilio ?? '', f.telefono ?? '', f.email ?? '']);
      fs.writeFileSync(rutaClientes, contenido, 'utf-8');
      log('INFO', `clientes.csv generado (${clientes.length} clientes)`);

      const { rows: movs } = await pgClient.query(`
        SELECT fecha, "createdAt" AS creado, tipo, descripcion, "medioPago" AS medio_pago, monto
        FROM movimientos_caja WHERE "cierreId" IS NULL ORDER BY fecha, "createdAt"
      `);
      const { rows: cierres } = await pgClient.query(`
        SELECT fecha, "montoTotal" AS total, "montoEfectivo" AS efectivo,
          "montoTransferencia" AS transferencia, "montoTarjeta" AS tarjeta, "montoOtro" AS otro
        FROM cierres_caja ORDER BY fecha DESC
      `);
      contenido = '=== MOVIMIENTOS ABIERTOS (sin cerrar) ===\n';
      contenido += filaCsv(['fecha', 'hora', 'tipo', 'descripcion', 'medioPago', 'monto']);
      for (const f of movs) contenido += filaCsv([f.fecha, f.creado ? f.creado.toISOString().slice(11, 16) : '', f.tipo, f.descripcion ?? '', f.medio_pago, formatearMonto(f.monto)]);
      contenido += '\n=== CIERRES (arqueos) ===\n';
      contenido += filaCsv(['fecha', 'total', 'efectivo', 'transferencia', 'tarjeta', 'otro']);
      for (const f of cierres) contenido += filaCsv([f.fecha, formatearMonto(f.total), formatearMonto(f.efectivo), formatearMonto(f.transferencia), formatearMonto(f.tarjeta), formatearMonto(f.otro)]);
      fs.writeFileSync(rutaCaja, contenido, 'utf-8');
      log('INFO', `caja.csv generado (${movs.length + cierres.length} filas)`);
    } catch (err) {
      csvsOk = false;
      log('ERROR', `Falló la generación de CSVs: ${(err as Error).message}`);
    } finally {
      await pgClient.end();
    }

    // 3) Destinos
    const dirPendrive = config.BACKUP_DIR_PENDRIVE;
    const dirDrive = config.BACKUP_DIR_DRIVE;

    const copiarADestino = (nombre: string, dirDestino: string | undefined): ResultadoDestino => {
      if (!dirDestino) {
        return { nombre, estado: 'omitido', detalle: 'no configurado' };
      }
      try {
        fs.mkdirSync(dirDestino, { recursive: true });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        return { nombre, estado: 'omitido', detalle: code === 'ENOENT' ? `no está montado (${dirDestino})` : (err as Error).message };
      }
      try {
        // Copiar la carpeta entera con sus archivos adentro
        const destinoCarpeta = path.join(dirDestino, carpetaEjecucion);
        fs.cpSync(dirDestinoLocal, destinoCarpeta, { recursive: true });
        return { nombre, estado: 'ok' };
      } catch (err) {
        return { nombre, estado: 'error', detalle: (err as Error).message };
      }
    };

    const resultados: ResultadoDestino[] = [
      { nombre: 'LOCAL', estado: dumpOk && csvsOk ? 'ok' : 'error' },
      copiarADestino('PENDRIVE', dirPendrive),
      copiarADestino('DRIVE', dirDrive),
    ];

    for (const r of resultados) {
      if (r.estado === 'ok') log('INFO', `Destino ${r.nombre}: OK`);
      else if (r.estado === 'omitido') log('WARNING', `Destino ${r.nombre}: omitido — ${r.detalle}`);
      else log('WARNING', `Destino ${r.nombre}: FALLÓ — ${r.detalle}`);
    }

    // 4) Retención — limpia carpetas backup_AAAA-MM-DD_* más viejas que RETENCION_DIAS
    const dirPorDestino: Record<string, string | undefined> = {
      LOCAL: dirLocal,
      PENDRIVE: dirPendrive,
      DRIVE: dirDrive,
    };
    const patronCarpeta = /^backup_(\d{4}-\d{2}-\d{2})_\d{2}\.\d{2}\.\d{2}$/;
    for (const r of resultados) {
      if (r.estado !== 'ok') continue;
      const dir = dirPorDestino[r.nombre];
      if (!dir) continue;
      const hoyStr = hoy.toISOString().slice(0, 10);
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
      if (borrados > 0) log('INFO', `Retención en ${r.nombre}: ${borrados} carpeta(s) de más de ${RETENCION_DIAS} días borradas`);
    }

    const huboErrorCritico = !dumpOk || !csvsOk;
    log(huboErrorCritico ? 'ERROR' : 'INFO', `Backup finalizado ${huboErrorCritico ? 'CON ERRORES' : 'OK'}`);

    // 5) Persistir en DB
    const localResult = resultados.find((r) => r.nombre === 'LOCAL')!;
    const pendriveResult = resultados.find((r) => r.nombre === 'PENDRIVE')!;
    const driveResult = resultados.find((r) => r.nombre === 'DRIVE')!;

    const ejecucion = this.ejecucionRepo.create({
      fechaInicio: hoy,
      fechaFin: new Date(),
      exitoLocal: localResult.estado === 'ok',
      exitoPendrive: pendriveResult.estado === 'ok',
      exitoDrive: driveResult.estado === 'ok',
      omitidoPendrive: pendriveResult.estado === 'omitido',
      omitidoDrive: driveResult.estado === 'omitido',
      detalleLocal: localResult.detalle ?? null,
      detallePendrive: pendriveResult.detalle ?? null,
      detalleDrive: driveResult.detalle ?? null,
      exitoGlobal: !huboErrorCritico && localResult.estado === 'ok',
      bytesDump,
      log: logs.join('\n'),
    });

    const guardada = await this.ejecucionRepo.save(ejecucion);

    // Limpiar registros anteriores al límite (por defecto 90 días)
    const LIMITE_EJECUCIONES = 90;
    const borradas = await this.limpiarHistorialViejo(LIMITE_EJECUCIONES);
    if (borradas > 0) log('INFO', `Historial limpiado: ${borradas} ejecucion(es) de más de ${LIMITE_EJECUCIONES} días borradas`);

    return guardada;
  }

  // ---------------------------------------------------------------------------
  // HISTORIAL
  // ---------------------------------------------------------------------------

  async listarEjecuciones(limite = 30): Promise<EjecucionBackup[]> {
    return this.ejecucionRepo.find({
      order: { fechaInicio: 'DESC' },
      take: limite,
    });
  }

  async obtenerEjecucion(id: string): Promise<EjecucionBackup> {
    const ejecucion = await this.ejecucionRepo.findOneBy({ id });
    if (!ejecucion) {
      throw new NotFoundException('Ejecución de backup no encontrada');
    }
    return ejecucion;
  }

  async limpiarHistorialViejo(dias: number = 90): Promise<number> {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    const resultado = await this.ejecucionRepo.delete({
      fechaInicio: LessThan(fechaLimite),
    });
    return resultado.affected ?? 0;
  }

  // ---------------------------------------------------------------------------
  // ESTADO (alerta frontend)
  // ---------------------------------------------------------------------------

  async obtenerEstado(): Promise<{
    destinos: Record<string, { ultimoExitoso: string | null; ultimoIntento: string | null }>;
    diasSinBackupExterno: number | null;
    alertaBackupExterno: boolean;
  }> {
    const ultima = await this.ejecucionRepo.findOne({ order: { fechaInicio: 'DESC' } });

    const ultimoExterno = await this.ejecucionRepo.findOne({
      where: [{ exitoPendrive: true }, { exitoDrive: true }],
      order: { fechaInicio: 'DESC' },
    });

    const destinos = {
      LOCAL: {
        ultimoExitoso: ultima?.exitoLocal ? ultima.fechaInicio.toISOString().slice(0, 10) : null,
        ultimoIntento: ultima?.fechaInicio.toISOString().slice(0, 10) ?? null,
      },
      PENDRIVE: {
        ultimoExitoso: ultimoExterno?.exitoPendrive ? ultimoExterno.fechaInicio.toISOString().slice(0, 10) : null,
        ultimoIntento: ultima?.fechaInicio.toISOString().slice(0, 10) ?? null,
      },
      DRIVE: {
        ultimoExitoso: ultimoExterno?.exitoDrive ? ultimoExterno.fechaInicio.toISOString().slice(0, 10) : null,
        ultimoIntento: ultima?.fechaInicio.toISOString().slice(0, 10) ?? null,
      },
    };

    let diasSinBackupExterno: number | null = null;
    if (ultimoExterno) {
      const diff = Math.round((Date.now() - ultimoExterno.fechaInicio.getTime()) / 86_400_000);
      diasSinBackupExterno = diff;
    }

    return {
      destinos,
      diasSinBackupExterno,
      alertaBackupExterno: diasSinBackupExterno === null || diasSinBackupExterno > 3,
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVADO
  // ---------------------------------------------------------------------------

  private leerConfigDb() {
    return {
      host: this.configService.get('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      user: this.configService.get('DB_USER', 'postgres'),
      password: this.configService.get('DB_PASSWORD', 'postgres'),
      database: this.configService.get('DB_NAME', 'ferreteria_local'),
    };
  }
}
