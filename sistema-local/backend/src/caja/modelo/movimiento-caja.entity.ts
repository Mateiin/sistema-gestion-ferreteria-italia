import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum MedioPago {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA = 'TARJETA',
  OTRO = 'OTRO',
}

/**
 * Fecha local (no UTC): a diferencia de otros `fechaHoy()` del proyecto, acá
 * importa que coincida con el día real del comercio (Argentina, UTC-3) — con
 * `toISOString()` las ventas cargadas después de las 21hs quedaban fechadas
 * al día siguiente.
 */
function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/**
 * MODELO. Registro diario de ventas cargado a mano por el titular: solo
 * monto, quién/qué y medio de pago. Sin sesiones ni apertura/cierre de caja,
 * ni monto inicial — es una lista, no un arqueo.
 */
@Entity('movimientos_caja')
@Index(['fecha'])
export class MovimientoCaja {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', default: MedioPago.EFECTIVO })
  medioPago: MedioPago;

  @CreateDateColumn()
  createdAt: Date;

  static crear(monto: number, descripcion?: string, medioPago?: MedioPago): MovimientoCaja {
    const mov = new MovimientoCaja();
    mov.fecha = fechaHoy();
    mov.monto = monto;
    mov.descripcion = descripcion;
    mov.medioPago = medioPago ?? MedioPago.EFECTIVO;
    return mov;
  }

  /** Information Expert: total del día = suma de los movimientos. */
  static calcularTotal(movimientos: MovimientoCaja[]): number {
    const suma = movimientos.reduce((acc, mov) => acc + Number(mov.monto), 0);
    return Math.round(suma * 100) / 100;
  }

  /** Subtotal por medio de pago, para el desglose chico de la pantalla. */
  static calcularPorMedioPago(movimientos: MovimientoCaja[]): Record<MedioPago, number> {
    const totales: Record<MedioPago, number> = {
      [MedioPago.EFECTIVO]: 0,
      [MedioPago.TRANSFERENCIA]: 0,
      [MedioPago.TARJETA]: 0,
      [MedioPago.OTRO]: 0,
    };
    for (const mov of movimientos) {
      totales[mov.medioPago] += Number(mov.monto);
    }
    for (const medio of Object.keys(totales) as MedioPago[]) {
      totales[medio] = Math.round(totales[medio] * 100) / 100;
    }
    return totales;
  }
}
