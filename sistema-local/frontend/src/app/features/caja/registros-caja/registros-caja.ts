import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CierreCaja } from '../../../core/models/caja.model';
import { CajaService } from '../../../core/services/caja.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-registros-caja',
  imports: [DecimalPipe, DatePipe, RouterLink],
  templateUrl: './registros-caja.html',
})
export class RegistrosCaja {
  private readonly cajaService = inject(CajaService);
  private readonly router = inject(Router);

  protected readonly cierres = signal<CierreCaja[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cajaService.listarCierres().subscribe({
      next: (cierres) => {
        this.cierres.set(cierres);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected editar(cierre: CierreCaja): void {
    this.router.navigate(['/caja/registros', cierre.id]);
  }
}
