import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClienteConSaldo } from '../../../core/models/cuenta-corriente.model';
import { ClientesService } from '../../../core/services/clientes.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-cuentas-lista',
  imports: [DecimalPipe],
  templateUrl: './cuentas-lista.html',
})
export class CuentasLista {
  private readonly clientesService = inject(ClientesService);
  private readonly router = inject(Router);

  protected readonly clientesConSaldo = signal<ClienteConSaldo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.clientesService.conSaldo().subscribe({
      next: (clientes) => {
        this.clientesConSaldo.set(clientes);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected irACuenta(item: ClienteConSaldo): void {
    this.router.navigate(['/cuentas-por-cobrar', item.cliente.id]);
  }
}
