import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';

/** Unidad de medida por defecto de ARCA: 7 = "unidades" (el genérico) */
const UNIDAD_MEDIDA_DEFECTO = 7;

/** IVA por defecto en una ferretería (la mayoría de los productos van al 21%) */
const IVA_DEFECTO = 21;

/** MODELO. Una línea cargada en una ficha de venta (`Venta`). */
@Entity('lineas_venta')
export class LineaVenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ventaId: string;

  @ManyToOne(() => Venta, (venta) => venta.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ventaId' })
  venta: Venta;

  @Column({ type: 'varchar' })
  descripcion: string;

  @Column({ type: 'numeric', precision: 15, scale: 3 })
  cantidad: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: IVA_DEFECTO })
  ivaPorcentaje: number;

  /** Código de unidad de medida de ARCA (7 = unidades, el genérico) */
  @Column({ type: 'int', default: UNIDAD_MEDIDA_DEFECTO })
  unidadMedida: number;

  @CreateDateColumn()
  createdAt: Date;
}
