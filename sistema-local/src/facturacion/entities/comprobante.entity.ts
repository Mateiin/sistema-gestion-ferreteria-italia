import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Guarda cada comprobante emitido junto con su CAE. Esto es obligatorio:
 * ARCA exige conservar los comprobantes electrónicos de forma digital.
 * Además es tu respaldo si alguna vez tenés que demostrar qué facturaste.
 */
@Entity('comprobantes')
@Index(['emisorId', 'puntoVenta', 'tipoComprobante', 'numero'], { unique: true })
export class Comprobante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** A qué emisor pertenece (multi-tenant) */
  @Column()
  emisorId: string;

  /** Código ARCA: 1=Fact A, 6=Fact B, 11=Fact C */
  @Column({ type: 'int' })
  tipoComprobante: number;

  @Column({ type: 'int' })
  puntoVenta: number;

  @Column({ type: 'int' })
  numero: number;

  @Column({ type: 'int' })
  docTipoReceptor: number;

  @Column({ type: 'bigint' })
  docNroReceptor: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  importeNeto: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  importeIva: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  importeTotal: number;

  @Column()
  cae: string;

  /** Vencimiento del CAE (AAAAMMDD como lo devuelve ARCA) */
  @Column()
  vencimientoCae: string;

  /** Opcional: vínculo con la venta interna que originó la factura */
  @Column({ nullable: true })
  ventaId?: string;

  @Column({ default: 'autorizado' })
  estado: string; // autorizado | anulado

  @CreateDateColumn()
  emitidoEl: Date;
}
