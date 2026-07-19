import { Component, inject, signal } from '@angular/core';
import { BackupService } from '../../core/services/backup.service';

/**
 * Aviso discreto (no bloquea nada) si hace varios días que no hay backup
 * EXTERNO (pendrive o Drive) exitoso — el backup "solo local" no protege del
 * escenario principal (se muere el disco de la PC). Ver `BackupGestor` en
 * el backend. No se muestra nada mientras el backup externo está al día, ni
 * si el endpoint falla (un error de red no se lee como "hay un problema").
 */
@Component({
  selector: 'app-backup-alerta',
  imports: [],
  templateUrl: './backup-alerta.html',
})
export class BackupAlerta {
  private readonly backupService = inject(BackupService);

  protected readonly mostrar = signal(false);
  protected readonly dias = signal<number | null>(null);

  constructor() {
    this.backupService.estado().subscribe({
      next: (estado) => {
        this.mostrar.set(estado.alertaBackupExterno);
        this.dias.set(estado.diasSinBackupExterno);
      },
      error: () => {
        // Backend viejo sin este endpoint, o caído -- no mostrar nada.
      },
    });
  }
}
