import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cliente } from './cliente.entity';
import { LineaVenta } from './linea-venta.entity';

export enum EstadoVenta {
  ABIERTA = 'ABIERTA',
  EMITIDA = 'EMITIDA',
  ANULADA = 'ANULADA',
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * MODELO. La "ficha" de venta a cuenta corriente: se le van agregando líneas
 * durante el mes hasta que se emite como factura o presupuesto (Fase 2, no
 * implementada — ver TODO(fase2-emision) en `VentasGestor`). El negocio
 * maneja una sola ficha ABIERTA por cliente a la vez; el índice único parcial
 * de abajo lo refuerza a nivel de base.
 */
@Entity('ventas')
@Index(['clienteId'], { unique: true, where: "estado = 'ABIERTA'" })
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'clienteId' })
  cliente: Cliente;

  @Column({ type: 'varchar', default: EstadoVenta.ABIERTA })
  estado: EstadoVenta;

  /** Se completa en Fase 2, al emitir la ficha como factura */
  @Column({ type: 'uuid', nullable: true })
  comprobanteId?: string;

  @OneToMany(() => LineaVenta, (linea) => linea.venta)
  lineas: LineaVenta[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Information Expert: suma de subtotales (cantidad * precioUnitario) de sus líneas. */
  total(): number {
    const suma = (this.lineas ?? []).reduce(
      (acc, linea) => acc + Number(linea.cantidad) * Number(linea.precioUnitario),
      0,
    );
    return redondear(suma);
  }
}
