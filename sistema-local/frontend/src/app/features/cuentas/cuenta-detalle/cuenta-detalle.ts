import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Cliente } from '../../../core/models/cliente.model';
import { CuentaCliente, TipoMovimientoCtaCte } from '../../../core/models/cuenta-corriente.model';
import { ClientesService } from '../../../core/services/clientes.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-cuenta-detalle',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './cuenta-detalle.html',
})
export class CuentaDetalle {
  private readonly fb = inject(FormBuilder);
  private readonly clientesService = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);

  protected readonly TipoMovimientoCtaCte = TipoMovimientoCtaCte;

  protected readonly clienteId = this.route.snapshot.paramMap.get('id')!;
  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly cuenta = signal<CuentaCliente | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly mostrarFormularioPago = signal(false);
  protected readonly registrandoPago = signal(false);
  protected readonly errorPago = signal<string | null>(null);

  protected readonly pagoForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    descripcion: [''],
  });

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    forkJoin({
      cliente: this.clientesService.obtener(this.clienteId),
      cuenta: this.clientesService.cuenta(this.clienteId),
    }).subscribe({
      next: ({ cliente, cuenta }) => {
        this.cliente.set(cliente);
        this.cuenta.set(cuenta);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected registrarPago(): void {
    if (this.pagoForm.invalid) {
      this.pagoForm.markAllAsTouched();
      return;
    }
    this.registrandoPago.set(true);
    this.errorPago.set(null);

    const valor = this.pagoForm.getRawValue();
    this.clientesService
      .registrarPago(this.clienteId, {
        monto: valor.monto,
        descripcion: valor.descripcion || undefined,
      })
      .subscribe({
        next: (cuenta) => {
          this.cuenta.set(cuenta);
          this.registrandoPago.set(false);
          this.mostrarFormularioPago.set(false);
          this.pagoForm.reset({ monto: 0, descripcion: '' });
        },
        error: (err) => {
          this.errorPago.set(extraerMensajeError(err));
          this.registrandoPago.set(false);
        },
      });
  }
}
