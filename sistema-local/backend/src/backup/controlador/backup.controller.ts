import { Controller, Get } from '@nestjs/common';
import { BackupGestor } from '../gestor/backup.gestor';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupGestor) {}

  /** Estado del backup por destino (local/pendrive/drive) + si hace falta
   * alertar por falta de copia externa reciente — ver `BackupGestor`. */
  @Get('estado')
  estado() {
    return this.backup.obtenerEstado();
  }
}
