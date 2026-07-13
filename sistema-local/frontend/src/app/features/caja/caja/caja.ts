import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DiaCaja, MEDIO_PAGO_OPCIONES, MedioPago } from '../../../core/models/caja.model';
import { CajaService } from '../../../core/services/caja.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

function fechaHoyLocal(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-caja',
  imports: [ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './caja.html',
})
export class Caja {
  private readonly fb = inject(FormBuilder);
  private readonly cajaService = inject(CajaService);

  protected readonly medioPagoOpciones = MEDIO_PAGO_OPCIONES;
  protected readonly MedioPago = MedioPago;

  protected readonly fechaSeleccionada = signal(fechaHoyLocal());
  protected readonly esHoy = signal(true);
  protected readonly dia = signal<DiaCaja | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly modalAbierto = signal(false);
  protected readonly registrando = signal(false);
  protected readonly errorModal = signal<string | null>(null);
  protected readonly movimientoForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    descripcion: [''],
    medioPago: [MedioPago.EFECTIVO],
  });

  protected readonly borrandoId = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  protected cambiarFecha(fecha: string): void {
    this.fechaSeleccionada.set(fecha);
    this.esHoy.set(fecha === fechaHoyLocal());
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.cajaService.dia(this.fechaSeleccionada()).subscribe({
      next: (dia) => {
        this.dia.set(dia);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected abrirModal(): void {
    this.errorModal.set(null);
    this.movimientoForm.reset({ monto: 0, descripcion: '', medioPago: MedioPago.EFECTIVO });
    this.modalAbierto.set(true);
  }

  protected cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  protected registrarVenta(): void {
    if (this.movimientoForm.invalid) {
      this.movimientoForm.markAllAsTouched();
      return;
    }
    this.registrando.set(true);
    this.errorModal.set(null);
    const valor = this.movimientoForm.getRawValue();
    this.cajaService
      .registrar({
        monto: valor.monto,
        descripcion: valor.descripcion || undefined,
        medioPago: valor.medioPago,
      })
      .subscribe({
        next: () => {
          this.registrando.set(false);
          this.modalAbierto.set(false);
          // Si se cargó una venta, mostramos el día de hoy (donde cae el registro).
          if (!this.esHoy()) {
            this.cambiarFecha(fechaHoyLocal());
          } else {
            this.cargar();
          }
        },
        error: (err) => {
          this.errorModal.set(extraerMensajeError(err));
          this.registrando.set(false);
        },
      });
  }

  protected borrar(id: string): void {
    this.borrandoId.set(id);
    this.error.set(null);
    this.cajaService.borrar(id).subscribe({
      next: () => {
        this.borrandoId.set(null);
        this.cargar();
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.borrandoId.set(null);
      },
    });
  }
}
