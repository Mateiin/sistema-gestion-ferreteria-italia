export interface EstadoDestinoBackup {
  ultimoExitoso: string | null;
  ultimoIntento: string | null;
  ultimoResultado: 'ok' | 'omitido' | 'error' | null;
  detalle?: string;
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
