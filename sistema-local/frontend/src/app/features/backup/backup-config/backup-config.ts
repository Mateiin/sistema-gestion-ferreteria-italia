import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BackupService } from '../../../core/services/backup.service';
import { ConfigBackup, EjecucionBackup } from '../../../core/models/backup.model';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-backup-config',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe],
  templateUrl: './backup-config.html',
})
export class BackupConfig {
  private readonly fb = inject(FormBuilder);
  private readonly backupService = inject(BackupService);

  protected readonly configForm = this.fb.nonNullable.group({
    BACKUP_DIR_LOCAL: ['', Validators.required],
    BACKUP_DIR_PENDRIVE: [''],
    BACKUP_DIR_DRIVE: [''],
  });

  protected readonly configCargada = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorConfig = signal<string | null>(null);
  protected readonly exitoConfig = signal<string | null>(null);

  // Ejecutar
  protected readonly ejecutando = signal(false);
  protected readonly ejecucionReciente = signal<EjecucionBackup | null>(null);
  protected readonly errorEjecucion = signal<string | null>(null);

  // Historial
  protected readonly historial = signal<EjecucionBackup[]>([]);
  protected readonly cargandoHistorial = signal(false);
  protected readonly errorHistorial = signal<string | null>(null);
  protected readonly ejecucionExpandida = signal<string | null>(null);

  constructor() {
    this.cargarConfig();
    this.cargarHistorial();
  }

  private cargarConfig(): void {
    this.errorConfig.set(null);
    this.backupService.config().subscribe({
      next: (config) => {
        this.configForm.patchValue({
          BACKUP_DIR_LOCAL: config.BACKUP_DIR_LOCAL ?? '',
          BACKUP_DIR_PENDRIVE: config.BACKUP_DIR_PENDRIVE ?? '',
          BACKUP_DIR_DRIVE: config.BACKUP_DIR_DRIVE ?? '',
        });
        this.configCargada.set(true);
      },
      error: () => this.configCargada.set(true),
    });
  }

  protected guardarConfig(): void {
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.errorConfig.set(null);
    this.exitoConfig.set(null);

    const raw = this.configForm.getRawValue();
    const dto: Partial<ConfigBackup> = {};
    if (raw.BACKUP_DIR_LOCAL) dto.BACKUP_DIR_LOCAL = raw.BACKUP_DIR_LOCAL;
    if (raw.BACKUP_DIR_PENDRIVE) dto.BACKUP_DIR_PENDRIVE = raw.BACKUP_DIR_PENDRIVE;
    if (raw.BACKUP_DIR_DRIVE) dto.BACKUP_DIR_DRIVE = raw.BACKUP_DIR_DRIVE;

    this.backupService.actualizarConfig(dto).subscribe({
      next: () => {
        this.guardando.set(false);
        this.exitoConfig.set('Configuración guardada correctamente.');
        setTimeout(() => this.exitoConfig.set(null), 4000);
      },
      error: (err) => {
        this.errorConfig.set(extraerMensajeError(err));
        this.guardando.set(false);
      },
    });
  }

  protected ejecutarBackup(): void {
    this.ejecutando.set(true);
    this.errorEjecucion.set(null);
    this.ejecucionReciente.set(null);

    this.backupService.ejecutar().subscribe({
      next: (resultado) => {
        this.ejecutando.set(false);
        this.ejecucionReciente.set(resultado);
        this.cargarHistorial();
      },
      error: (err) => {
        this.errorEjecucion.set(extraerMensajeError(err));
        this.ejecutando.set(false);
      },
    });
  }

  private cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    this.backupService.ejecuciones().subscribe({
      next: (lista) => {
        this.historial.set(lista);
        this.cargandoHistorial.set(false);
      },
      error: (err) => {
        this.errorHistorial.set(extraerMensajeError(err));
        this.cargandoHistorial.set(false);
      },
    });
  }

  protected toggleExpandir(id: string): void {
    this.ejecucionExpandida.set(this.ejecucionExpandida() === id ? null : id);
  }

  protected readonlyetiquetaExito(exito: boolean, omitido: boolean): string {
    if (omitido) return 'Omitido';
    return exito ? 'OK' : 'Error';
  }

  protected readonlyclaseBadge(exito: boolean, omitido: boolean): string {
    if (omitido) return 'badge-advertencia';
    return exito ? 'badge-exito' : 'badge-error';
  }
}
