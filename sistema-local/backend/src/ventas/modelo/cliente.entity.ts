import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Mismos valores que `CondicionIvaReceptorDto` de facturacion/ (no se importa
 * de ahí para no acoplar el módulo de ventas al de facturación; Fase 2 mapea
 * entre los dos al emitir).
 */
export enum CondicionIvaCliente {
  RESPONSABLE_INSCRIPTO = 'RESPONSABLE_INSCRIPTO',
  MONOTRIBUTO = 'MONOTRIBUTO',
  EXENTO = 'EXENTO',
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
}

/**
 * MODELO. Estos datos son los que autocompletan el receptor de la factura
 * en Fase 2 (incluida la Factura A, que necesita razón social y domicilio).
 */
@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  razonSocial: string;

  /** 80=CUIT, 96=DNI, 99=Consumidor Final (mismos códigos que usa ARCA) */
  @Column({ type: 'int' })
  docTipo: number;

  @Column({ type: 'bigint' })
  docNro: number;

  @Column({ type: 'varchar' })
  condicionIva: CondicionIvaCliente;

  @Column({ type: 'varchar', nullable: true })
  domicilio?: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string;

  @Column({ type: 'varchar', nullable: true })
  telefono?: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /**
   * Information Expert: el emisor es Responsable Inscripto, así que el tipo
   * de comprobante que le corresponde a este cliente depende únicamente de
   * su propia condición de IVA (Factura C queda fuera: el emisor no es
   * monotributista).
   */
  tipoFacturaCorrespondiente(): 'A' | 'B' {
    return this.condicionIva === CondicionIvaCliente.RESPONSABLE_INSCRIPTO
      ? 'A'
      : 'B';
  }
}
