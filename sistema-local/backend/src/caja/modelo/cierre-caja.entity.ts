import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MedioPago, MovimientoCaja } from './movimiento-caja.entity';

/**
 * MODELO. Arqueo de un día: snapshot del total y el desglose por medio de
 * pago en el momento del cierre. Un cierre por día como mucho (`fecha`
 * única). Information Expert de sus propios totales a partir de los
 * `MovimientoCaja` que se le pasan — reusa `MovimientoCaja.calcularTotal`/
 * `calcularPorMedioPago`, no reimplementa la suma.
 */
@Entity('cierres_caja')
export class CierreCaja {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  @Index({ unique: true })
  fecha: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  montoTotal: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  montoEfectivo: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  montoTransferencia: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  montoTarjeta: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  montoOtro: number;

  @CreateDateColumn()
  createdAt: Date;

  static crear(fecha: string, movimientos: MovimientoCaja[]): CierreCaja {
    const cierre = new CierreCaja();
    cierre.fecha = fecha;
    cierre.aplicarTotales(movimientos);
    return cierre;
  }

  /** Recalcula los montos guardados a partir de los movimientos vigentes del
   * cierre — se usa tanto al crearlo como al editarlo (agregar/sacar un
   * movimiento desde Registros). */
  aplicarTotales(movimientos: MovimientoCaja[]): void {
    const porMedioPago = MovimientoCaja.calcularPorMedioPago(movimientos);
    this.montoTotal = MovimientoCaja.calcularTotal(movimientos);
    this.montoEfectivo = porMedioPago[MedioPago.EFECTIVO];
    this.montoTransferencia = porMedioPago[MedioPago.TRANSFERENCIA];
    this.montoTarjeta = porMedioPago[MedioPago.TARJETA];
    this.montoOtro = porMedioPago[MedioPago.OTRO];
  }
}
