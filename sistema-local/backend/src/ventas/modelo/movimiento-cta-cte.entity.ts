import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TipoMovimientoCtaCte {
  CARGO = 'CARGO',
  PAGO = 'PAGO',
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * MODELO. Un movimiento de cuenta corriente (fiado): CARGO (factura en
 * cuenta corriente) o PAGO (imputación global, no contra una factura
 * puntual — ver "Ventas (Ficha)" en CLAUDE.md). El saldo del cliente se
 * DERIVA de estos movimientos (Information Expert: `calcularSaldo`), no es
 * una columna fuente de verdad.
 */
@Entity('movimientos_cta_cte')
@Index(['clienteId'])
export class MovimientoCtaCte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clienteId: string;

  @Column({ type: 'varchar' })
  tipo: TipoMovimientoCtaCte;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  monto: number;

  @Column({ type: 'date' })
  fecha: string;

  /** Si el CARGO vino de una factura, referencia al comprobante que lo originó */
  @Column({ type: 'uuid', nullable: true })
  comprobanteId?: string;

  @Column({ type: 'varchar', nullable: true })
  descripcion?: string;

  @CreateDateColumn()
  createdAt: Date;

  /** Creator: cargo por una factura emitida en cuenta corriente. */
  static crearCargo(
    clienteId: string,
    monto: number,
    comprobanteId: string,
  ): MovimientoCtaCte {
    const mov = new MovimientoCtaCte();
    mov.clienteId = clienteId;
    mov.tipo = TipoMovimientoCtaCte.CARGO;
    mov.monto = monto;
    mov.fecha = fechaHoy();
    mov.comprobanteId = comprobanteId;
    return mov;
  }

  /** Creator: pago del cliente. Imputación global, no contra una factura puntual. */
  static crearPago(
    clienteId: string,
    monto: number,
    descripcion?: string,
  ): MovimientoCtaCte {
    const mov = new MovimientoCtaCte();
    mov.clienteId = clienteId;
    mov.tipo = TipoMovimientoCtaCte.PAGO;
    mov.monto = monto;
    mov.fecha = fechaHoy();
    mov.descripcion = descripcion;
    return mov;
  }

  /** Information Expert: el saldo es la suma de CARGO menos PAGO. */
  static calcularSaldo(movimientos: MovimientoCtaCte[]): number {
    const suma = movimientos.reduce((acc, mov) => {
      const monto = Number(mov.monto);
      return mov.tipo === TipoMovimientoCtaCte.CARGO ? acc + monto : acc - monto;
    }, 0);
    return redondear(suma);
  }
}
