import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  imports: [ReactiveFormsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './caja.html',
})
export class Caja {
  private readonly fb = inject(FormBuilder);
  private readonly cajaService = inject(CajaService);

  @ViewChild('montoInput') private montoInput?: ElementRef<HTMLInputElement>;

  protected readonly medioPagoOpciones = MEDIO_PAGO_OPCIONES;
  protected readonly MedioPago = MedioPago;

  protected readonly fechaSeleccionada = signal(fechaHoyLocal());
  protected readonly esHoy = signal(true);
  protected readonly dia = signal<DiaCaja | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly agregando = signal(false);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly movimientoForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    descripcion: [''],
    medioPago: [MedioPago.EFECTIVO],
  });

  protected readonly borrandoId = signal<string | null>(null);

  protected readonly modalCerrarAbierto = signal(false);
  protected readonly cerrando = signal(false);
  protected readonly errorCierre = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  protected cambiarFecha(fecha: string): void {
    this.fechaSeleccionada.set(fecha);
    this.esHoy.set(fecha === fechaHoyLocal());
    this.cargar();
  }

  /**
   * `mostrarSpinner` en false para refrescos posteriores a un alta/borrado:
   * poner `cargando` en true destruye y recrea el bloque entero (según el
   * @if/@else del template), lo que se lleva puesto el foco recién devuelto
   * al campo monto — inaceptable para carga rápida y seguida en el mostrador.
   *
   * Siempre reenfoca monto al terminar: es la única forma confiable de
   * lograrlo también en la carga inicial — el campo no existe en el DOM
   * todavía mientras `cargando` es true (está detrás del spinner), así que
   * intentarlo antes de que la respuesta llegue no tiene efecto.
   */
  private cargar(mostrarSpinner = true): void {
    if (mostrarSpinner) this.cargando.set(true);
    this.error.set(null);
    this.cajaService.dia(this.fechaSeleccionada()).subscribe({
      next: (dia) => {
        this.dia.set(dia);
        if (mostrarSpinner) this.cargando.set(false);
        this.enfocarMonto();
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        if (mostrarSpinner) this.cargando.set(false);
      },
    });
  }

  protected agregarVenta(): void {
    if (this.movimientoForm.invalid) {
      this.movimientoForm.markAllAsTouched();
      return;
    }
    this.agregando.set(true);
    this.errorCarga.set(null);
    const valor = this.movimientoForm.getRawValue();
    this.cajaService
      .registrar({
        monto: valor.monto,
        descripcion: valor.descripcion || undefined,
        medioPago: valor.medioPago,
      })
      .subscribe({
        next: () => {
          this.agregando.set(false);
          this.movimientoForm.reset({ monto: 0, descripcion: '', medioPago: MedioPago.EFECTIVO });
          // Si se cargó una venta, mostramos el día de hoy (donde cae el registro).
          if (!this.esHoy()) {
            this.cambiarFecha(fechaHoyLocal());
          } else {
            this.cargar(false);
          }
        },
        error: (err) => {
          this.errorCarga.set(extraerMensajeError(err));
          this.agregando.set(false);
        },
      });
  }

  protected borrar(id: string): void {
    this.borrandoId.set(id);
    this.error.set(null);
    this.cajaService.borrar(id).subscribe({
      next: () => {
        this.borrandoId.set(null);
        this.cargar(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.borrandoId.set(null);
      },
    });
  }

  protected abrirModalCerrar(): void {
    this.errorCierre.set(null);
    this.modalCerrarAbierto.set(true);
  }

  protected cerrarModalCerrar(): void {
    this.modalCerrarAbierto.set(false);
  }

  protected confirmarCierre(): void {
    this.cerrando.set(true);
    this.errorCierre.set(null);
    this.cajaService.cerrar(this.fechaSeleccionada()).subscribe({
      next: () => {
        this.cerrando.set(false);
        this.modalCerrarAbierto.set(false);
        // La caja del día queda archivada bajo el cierre: la vista se "vacía".
        this.cargar(false);
      },
      error: (err) => {
        this.errorCierre.set(extraerMensajeError(err));
        this.cerrando.set(false);
      },
    });
  }

  /**
   * Foco + selección explícitos (no alcanza con disparar `focus()`: si el
   * campo ya estaba enfocado —típico al cargar seguido con Enter— el
   * navegador no reemite el evento `focus` y el `select()` del template
   * nunca corre, dejando el cursor al final del "0" en vez de reemplazarlo).
   */
  private enfocarMonto(): void {
    setTimeout(() => {
      const elemento = this.montoInput?.nativeElement;
      elemento?.focus();
      elemento?.select();
    });
  }
}
