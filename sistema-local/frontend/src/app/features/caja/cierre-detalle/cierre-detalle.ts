import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CierreConMovimientos,
  MEDIO_PAGO_OPCIONES,
  MedioPago,
  TipoMovimientoCaja,
} from '../../../core/models/caja.model';
import { CajaService } from '../../../core/services/caja.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

/**
 * Editar un cierre YA cerrado: agregar o sacar un movimiento que se olvidó
 * cargar antes de cerrar. Mismo criterio que `Caja`, pero acá cada alta se
 * ata al cierre (`cierreId`) en vez de a la caja del día en curso, y el
 * backend recalcula y persiste los totales del cierre después de cada
 * cambio — no se calculan acá, se refleja lo que devuelve el backend.
 */
@Component({
  selector: 'app-cierre-detalle',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './cierre-detalle.html',
})
export class CierreDetalle {
  private readonly fb = inject(FormBuilder);
  private readonly cajaService = inject(CajaService);
  private readonly route = inject(ActivatedRoute);

  protected readonly medioPagoOpciones = MEDIO_PAGO_OPCIONES;
  protected readonly TipoMovimientoCaja = TipoMovimientoCaja;

  protected readonly cierreId = this.route.snapshot.paramMap.get('id')!;
  protected readonly datos = signal<CierreConMovimientos | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly mostrarFormulario = signal(false);
  protected readonly agregando = signal(false);
  protected readonly errorAlta = signal<string | null>(null);
  protected readonly movimientoForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    descripcion: [''],
    medioPago: [MedioPago.EFECTIVO],
  });

  protected readonly mostrarFormularioRetiro = signal(false);
  protected readonly retirando = signal(false);
  protected readonly errorRetiro = signal<string | null>(null);
  protected readonly retiroForm = this.fb.nonNullable.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    descripcion: [''],
  });

  protected readonly borrandoId = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.cajaService.obtenerCierre(this.cierreId).subscribe({
      next: (datos) => {
        this.datos.set(datos);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargando.set(false);
      },
    });
  }

  protected abrirFormulario(): void {
    this.mostrarFormularioRetiro.set(false);
    this.mostrarFormulario.set(true);
  }

  protected abrirFormularioRetiro(): void {
    this.mostrarFormulario.set(false);
    this.mostrarFormularioRetiro.set(true);
  }

  protected agregarMovimiento(): void {
    if (this.movimientoForm.invalid) {
      this.movimientoForm.markAllAsTouched();
      return;
    }
    this.agregando.set(true);
    this.errorAlta.set(null);
    const valor = this.movimientoForm.getRawValue();
    this.cajaService
      .registrar({
        monto: valor.monto,
        descripcion: valor.descripcion || undefined,
        medioPago: valor.medioPago,
        cierreId: this.cierreId,
      })
      .subscribe({
        next: () => {
          this.agregando.set(false);
          this.mostrarFormulario.set(false);
          this.movimientoForm.reset({ monto: 0, descripcion: '', medioPago: MedioPago.EFECTIVO });
          this.cargar();
        },
        error: (err) => {
          this.errorAlta.set(extraerMensajeError(err));
          this.agregando.set(false);
        },
      });
  }

  protected confirmarRetiro(): void {
    if (this.retiroForm.invalid) {
      this.retiroForm.markAllAsTouched();
      return;
    }
    this.retirando.set(true);
    this.errorRetiro.set(null);
    const valor = this.retiroForm.getRawValue();
    this.cajaService
      .registrar({
        monto: valor.monto,
        descripcion: valor.descripcion || undefined,
        tipo: TipoMovimientoCaja.RETIRO,
        cierreId: this.cierreId,
      })
      .subscribe({
        next: () => {
          this.retirando.set(false);
          this.mostrarFormularioRetiro.set(false);
          this.retiroForm.reset({ monto: 0, descripcion: '' });
          this.cargar();
        },
        error: (err) => {
          this.errorRetiro.set(extraerMensajeError(err));
          this.retirando.set(false);
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
