import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const NOMBRE_ARCHIVO_ESTADO = 'estado-backup.json';
const DIAS_ALERTA_BACKUP_EXTERNO = 3;

type ResultadoDestino = 'ok' | 'omitido' | 'error';

interface EstadoDestino {
  ultimoExitoso: string | null;
  ultimoIntento: string | null;
  ultimoResultado: ResultadoDestino | null;
  detalle?: string;
}

interface EstadoBackupArchivo {
  destinos: Record<'LOCAL' | 'PENDRIVE' | 'DRIVE', EstadoDestino>;
}

export interface EstadoBackupRespuesta extends EstadoBackupArchivo {
  /** true si hace más de DIAS_ALERTA_BACKUP_EXTERNO días (o nunca) que hay
   * una copia exitosa en pendrive o Drive — ver `backup-alerta` en el frontend. */
  alertaBackupExterno: boolean;
  /** null si todavía no hubo ningún backup externo exitoso. */
  diasSinBackupExterno: number | null;
}

const ESTADO_DESTINO_VACIO: EstadoDestino = {
  ultimoExitoso: null,
  ultimoIntento: null,
  ultimoResultado: null,
};

/** Diferencia en días de calendario (no de 24hs) entre hoy y una fecha 'AAAA-MM-DD'. */
function diasDesde(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaLocal = new Date(anio, mes - 1, dia);
  const hoyLocal = new Date();
  hoyLocal.setHours(0, 0, 0, 0);
  fechaLocal.setHours(0, 0, 0, 0);
  return Math.round((hoyLocal.getTime() - fechaLocal.getTime()) / 86_400_000);
}

/**
 * GESTOR (GRASP Controller). Lee el `estado-backup.json` que escribe
 * `scripts/backup.ts` en cada corrida (standalone, no pasa por acá) y lo
 * traduce a una alerta simple: ¿hace cuánto que no hay backup EXTERNO
 * (pendrive o Drive) exitoso? El backup "solo local" no protege del
 * escenario principal (se muere el disco de la PC) — de eso alerta esto.
 */
@Injectable()
export class BackupGestor {
  constructor(private readonly config: ConfigService) {}

  obtenerEstado(): EstadoBackupRespuesta {
    const dirLocal = this.config.get<string>('BACKUP_DIR_LOCAL');
    const rutaEstado = dirLocal ? join(dirLocal, NOMBRE_ARCHIVO_ESTADO) : null;

    let destinos: EstadoBackupArchivo['destinos'] = {
      LOCAL: ESTADO_DESTINO_VACIO,
      PENDRIVE: ESTADO_DESTINO_VACIO,
      DRIVE: ESTADO_DESTINO_VACIO,
    };
    if (rutaEstado && existsSync(rutaEstado)) {
      try {
        const parseado = JSON.parse(readFileSync(rutaEstado, 'utf-8')) as Partial<EstadoBackupArchivo>;
        destinos = {
          LOCAL: parseado.destinos?.LOCAL ?? ESTADO_DESTINO_VACIO,
          PENDRIVE: parseado.destinos?.PENDRIVE ?? ESTADO_DESTINO_VACIO,
          DRIVE: parseado.destinos?.DRIVE ?? ESTADO_DESTINO_VACIO,
        };
      } catch {
        // Archivo corrupto o a medio escribir (backup.ts escribiéndolo justo
        // ahora) -- se informa "sin datos" en vez de romper el endpoint.
      }
    }

    const fechasExitosasExternas = [destinos.PENDRIVE.ultimoExitoso, destinos.DRIVE.ultimoExitoso].filter(
      (f): f is string => f !== null,
    );
    const diasSinBackupExterno = fechasExitosasExternas.length
      ? Math.min(...fechasExitosasExternas.map(diasDesde))
      : null;

    return {
      destinos,
      diasSinBackupExterno,
      alertaBackupExterno: diasSinBackupExterno === null || diasSinBackupExterno > DIAS_ALERTA_BACKUP_EXTERNO,
    };
  }
}
