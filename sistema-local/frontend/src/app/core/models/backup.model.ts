export interface ConfigBackup {
  BACKUP_DIR_LOCAL: string;
  BACKUP_DIR_PENDRIVE?: string;
  BACKUP_DIR_DRIVE?: string;
}

export interface EjecucionBackup {
  id: string;
  fechaInicio: string;
  fechaFin: string | null;
  exitoLocal: boolean;
  exitoPendrive: boolean;
  exitoDrive: boolean;
  omitidoPendrive: boolean;
  omitidoDrive: boolean;
  detalleLocal: string | null;
  detallePendrive: string | null;
  detalleDrive: string | null;
  exitoGlobal: boolean;
  bytesDump: number | null;
  log: string | null;
  createdAt: string;
}

export interface EstadoDestinoBackup {
  ultimoExitoso: string | null;
  ultimoIntento: string | null;
}

export interface EstadoBackup {
  destinos: {
    LOCAL: EstadoDestinoBackup;
    PENDRIVE: EstadoDestinoBackup;
    DRIVE: EstadoDestinoBackup;
  };
  diasSinBackupExterno: number | null;
  alertaBackupExterno: boolean;
}
