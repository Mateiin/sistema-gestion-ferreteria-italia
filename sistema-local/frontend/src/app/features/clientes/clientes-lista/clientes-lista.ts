import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CONDICION_IVA_LEGIBLE, Cliente } from '../../../core/models/cliente.model';
import { ClientesService } from '../../../core/services/clientes.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-clientes-lista',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './clientes-lista.html',
})
export class ClientesLista {
  private readonly clientesService = inject(ClientesService);

  protected readonly buscador = new FormControl('', { nonNullable: true });
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.buscador.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((nombre) => this.buscar(nombre));
    this.buscar('');
  }

  protected condicionIvaLegible(cliente: Cliente): string {
    return CONDICION_IVA_LEGIBLE[cliente.condicionIva];
  }

  private buscar(nombre: string): void {
    this.cargando.set(true);
    this.error.set(null);
    this.clientesService.listar(nombre || undefined).subscribe({
      next: (clientes) => {
        this.clientes.set(clientes);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }
}
