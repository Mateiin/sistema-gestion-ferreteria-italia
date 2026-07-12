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

export class FichaNoAbiertaError extends Error {
  constructor(public readonly estadoActual: EstadoVenta) {
    super(`La ficha está ${estadoActual}: no se puede facturar`);
  }
}

export class FichaSinLineasError extends Error {
  constructor() {
    super('La ficha no tiene líneas cargadas: no se puede facturar');
  }
}

/**
 * MODELO. La "ficha" de venta a cuenta corriente: se le van agregando líneas
 * durante el mes hasta que se emite como factura o presupuesto (Fase 2). El
 * negocio maneja una sola ficha ABIERTA por cliente a la vez; el índice único
 * parcial de abajo lo refuerza a nivel de base.
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

  /**
   * Valida que la ficha se pueda facturar: debe estar ABIERTA y tener al
   * menos una línea cargada. Tira un error de dominio si no (el Gestor lo
   * traduce a 400). El presupuesto no tiene esta restricción: se puede pedir
   * en cualquier estado, las veces que haga falta.
   */
  validarPuedeFacturar(): void {
    if (this.estado !== EstadoVenta.ABIERTA) {
      throw new FichaNoAbiertaError(this.estado);
    }
    if (!this.lineas || this.lineas.length === 0) {
      throw new FichaSinLineasError();
    }
  }

  /** Se marca a sí misma emitida al facturarse (Information Expert). */
  marcarEmitida(comprobanteId: string): void {
    this.estado = EstadoVenta.EMITIDA;
    this.comprobanteId = comprobanteId;
  }

  /** Nombre de archivo sugerido para el PDF del presupuesto. */
  nombreArchivoPresupuesto(): string {
    return `presupuesto-${this.id}.pdf`;
  }
}
