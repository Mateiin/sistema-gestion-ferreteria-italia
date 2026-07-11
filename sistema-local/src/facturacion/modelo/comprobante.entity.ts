import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  AlicuotaDesglose,
  CondicionIvaReceptor,
  ComprobanteAsociado,
  DatosNotaCredito,
  ResultadoCae,
  TipoFacturaDominio,
} from '../interfaces/arca-provider.interface';

/** IVA por defecto en una ferretería (la mayoría de los productos van al 21%) */
const IVA_DEFECTO = 21;

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export class ComprobanteYaAnuladoError extends Error {
  constructor(public readonly estadoActual: string) {
    super(`El comprobante ya está en estado "${estadoActual}"`);
  }
}

export class SinDesgloseIvaError extends Error {
  constructor() {
    super(
      'Este comprobante no tiene guardado el desglose de IVA y no se puede anular automáticamente',
    );
  }
}

export interface ItemCargado {
  cantidad: number;
  precioUnitario: number;
  /** Alícuota de IVA en %. Si no se envía, se asume 21 (IVA_DEFECTO). */
  ivaPorcentaje?: number;
}

export interface DatosReceptor {
  docTipoReceptor: number;
  docNroReceptor: number;
  condicionIvaReceptor?: CondicionIvaReceptor;
}

/**
 * MODELO. Guarda cada comprobante emitido junto con su CAE (obligatorio: ARCA
 * exige conservar los comprobantes electrónicos de forma digital) y concentra
 * la lógica de negocio de facturación: calcular montos, decidir si se puede
 * anular y armar su propia Nota de Crédito. El Gestor no calcula nada, solo
 * invoca estos métodos y los delega al puerto ARCA / al repositorio.
 */
@Entity('comprobantes')
@Index(['emisorId', 'puntoVenta', 'tipoComprobante', 'numero'], { unique: true })
export class Comprobante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** A qué emisor pertenece (multi-tenant) */
  @Column({ type: 'varchar' })
  emisorId: string;

  /** Código ARCA: 1=Fact A, 6=Fact B, 11=Fact C, 3=NC A, 8=NC B */
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

  /**
   * Requerido solo para Factura A (condición de IVA del receptor ante ARCA).
   * Se guarda también para poder reconstruir la Nota de Crédito más adelante.
   */
  @Column({ type: 'varchar', nullable: true })
  condicionIvaReceptor?: string;

  /**
   * Importes agrupados por alícuota. Sin esto no se puede armar la Nota de
   * Crédito de un comprobante con más de una alícuota: los totales agregados
   * de arriba no alcanzan para reconstruir el desglose.
   */
  @Column({ type: 'jsonb', nullable: true })
  ivaDesglose?: AlicuotaDesglose[];

  @Column({ type: 'varchar' })
  cae: string;

  /** Vencimiento del CAE (AAAAMMDD como lo devuelve ARCA) */
  @Column({ type: 'varchar' })
  vencimientoCae: string;

  /** Opcional: vínculo con la venta interna que originó la factura */
  @Column({ type: 'varchar', nullable: true })
  ventaId?: string;

  /** Si este registro ES una Nota de Crédito, el id del comprobante que anula */
  @Column({ type: 'varchar', nullable: true })
  comprobanteOriginalId?: string;

  @Column({ type: 'varchar', default: 'autorizado' })
  estado: string; // autorizado | anulado

  @CreateDateColumn()
  emitidoEl: Date;

  /**
   * Information Expert: agrupa los ítems cargados por alícuota y calcula neto
   * e IVA de cada grupo. ARCA pide el IVA discriminado por alícuota, no por
   * línea de venta.
   */
  static calcularDesglose(items: ItemCargado[]): AlicuotaDesglose[] {
    const porAlicuota = new Map<number, { neto: number; iva: number }>();
    for (const item of items) {
      const ivaPorcentaje = item.ivaPorcentaje ?? IVA_DEFECTO;
      const neto = redondear(item.cantidad * item.precioUnitario);
      const acumulado = porAlicuota.get(ivaPorcentaje) ?? { neto: 0, iva: 0 };
      acumulado.neto = redondear(acumulado.neto + neto);
      acumulado.iva = redondear(acumulado.iva + neto * (ivaPorcentaje / 100));
      porAlicuota.set(ivaPorcentaje, acumulado);
    }
    return [...porAlicuota.entries()].map(([alicuotaPorcentaje, v]) => ({
      alicuotaPorcentaje,
      neto: v.neto,
      iva: v.iva,
    }));
  }

  /** Suma el desglose por alícuota en los tres totales del comprobante. */
  static totalizar(desglose: AlicuotaDesglose[]): {
    importeNeto: number;
    importeIva: number;
    importeTotal: number;
  } {
    const importeNeto = redondear(
      desglose.reduce((acc, d) => acc + d.neto, 0),
    );
    const importeIva = redondear(desglose.reduce((acc, d) => acc + d.iva, 0));
    return {
      importeNeto,
      importeIva,
      importeTotal: redondear(importeNeto + importeIva),
    };
  }

  /**
   * La condición de IVA del receptor solo hace falta para Factura A; Factura B
   * no la lleva. Si se pide A y no vino una condición explícita, el default de
   * negocio es Responsable Inscripto.
   */
  static condicionIvaRequerida(
    tipoFactura: TipoFacturaDominio,
    condicionSolicitada?: CondicionIvaReceptor,
  ): CondicionIvaReceptor | undefined {
    if (tipoFactura !== 'A') return undefined;
    return condicionSolicitada ?? 'RESPONSABLE_INSCRIPTO';
  }

  /** Creator: arma el comprobante ya autorizado por ARCA, listo para guardar. */
  static crearAutorizado(
    datos: {
      emisorId: string;
      tipoComprobante: number;
      puntoVenta: number;
      ventaId?: string;
    } & DatosReceptor,
    desglose: AlicuotaDesglose[],
    resultado: ResultadoCae,
  ): Comprobante {
    const comprobante = new Comprobante();
    comprobante.emisorId = datos.emisorId;
    comprobante.tipoComprobante = datos.tipoComprobante;
    comprobante.puntoVenta = datos.puntoVenta;
    comprobante.numero = resultado.numeroComprobante;
    comprobante.docTipoReceptor = datos.docTipoReceptor;
    comprobante.docNroReceptor = datos.docNroReceptor;
    comprobante.condicionIvaReceptor = datos.condicionIvaReceptor;
    comprobante.ivaDesglose = desglose;
    Object.assign(comprobante, Comprobante.totalizar(desglose));
    comprobante.cae = resultado.cae;
    comprobante.vencimientoCae = resultado.vencimientoCae;
    comprobante.ventaId = datos.ventaId;
    return comprobante;
  }

  /**
   * Valida que este comprobante se pueda anular y arma lo que el puerto ARCA
   * necesita para pedir la Nota de Crédito. Tira un error de dominio si no se
   * puede (el Gestor lo traduce a la excepción HTTP correspondiente).
   */
  prepararNotaCredito(tipoFactura: TipoFacturaDominio): DatosNotaCredito {
    if (this.estado !== 'autorizado') {
      throw new ComprobanteYaAnuladoError(this.estado);
    }
    if (!this.ivaDesglose || this.ivaDesglose.length === 0) {
      throw new SinDesgloseIvaError();
    }

    const comprobanteAsociado: ComprobanteAsociado = {
      tipoComprobante: this.tipoComprobante,
      puntoVenta: this.puntoVenta,
      numero: this.numero,
    };

    return {
      tipoFactura,
      docTipoReceptor: this.docTipoReceptor,
      docNroReceptor: Number(this.docNroReceptor),
      condicionIvaReceptor: Comprobante.condicionIvaRequerida(
        tipoFactura,
        this.condicionIvaReceptor as CondicionIvaReceptor,
      ),
      ivaDesglose: this.ivaDesglose,
      ...Comprobante.totalizar(this.ivaDesglose),
      comprobanteAsociado,
    };
  }

  /**
   * Se marca a sí mismo anulado y crea (sin persistir) la Nota de Crédito que
   * lo anula, ya autorizada. Information Expert: nadie mejor que el propio
   * comprobante para saber cómo referenciarse a sí mismo.
   */
  registrarNotaCredito(
    codigoNotaCredito: number,
    resultado: ResultadoCae,
  ): Comprobante {
    const notaCredito = Comprobante.crearAutorizado(
      {
        emisorId: this.emisorId,
        tipoComprobante: codigoNotaCredito,
        puntoVenta: this.puntoVenta,
        docTipoReceptor: this.docTipoReceptor,
        docNroReceptor: Number(this.docNroReceptor),
        condicionIvaReceptor: this.condicionIvaReceptor as CondicionIvaReceptor,
      },
      this.ivaDesglose!,
      resultado,
    );
    notaCredito.comprobanteOriginalId = this.id;
    this.estado = 'anulado';
    return notaCredito;
  }
}
