import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Venta } from '../../../core/models/venta.model';
import { VentasService } from '../../../core/services/ventas.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-fichas-abiertas',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './fichas-abiertas.html',
})
export class FichasAbiertas {
  private readonly ventasService = inject(VentasService);
  private readonly router = inject(Router);

  protected readonly fichas = signal<Venta[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.ventasService.abiertas().subscribe({
      next: (fichas) => {
        this.fichas.set(fichas);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected irAFicha(venta: Venta): void {
    this.router.navigate(['/ventas', venta.id]);
  }
}
