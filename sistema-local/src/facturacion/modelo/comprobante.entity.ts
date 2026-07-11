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
import { Emisor } from '../config/emisor';

/** IVA por defecto en una ferretería (la mayoría de los productos van al 21%) */
const IVA_DEFECTO = 21;

/** Letra impresa del comprobante según el código ARCA (factura y NC comparten letra) */
const LETRA_POR_CODIGO: Record<number, string> = {
  1: 'A',
  3: 'A',
  6: 'B',
  8: 'B',
  11: 'C',
};

/** Nombre completo del tipo de comprobante, para el título del PDF */
const NOMBRE_POR_CODIGO: Record<number, string> = {
  1: 'Factura',
  3: 'Nota de Crédito',
  6: 'Factura',
  8: 'Nota de Crédito',
  11: 'Factura',
};

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convierte 'AAAAMMDD' (formato WSFEv1) a 'AAAA-MM-DD' (columna date / QR RG 4892) */
function formatearFechaColumna(fechaArca: string): string {
  return `${fechaArca.slice(0, 4)}-${fechaArca.slice(4, 6)}-${fechaArca.slice(6, 8)}`;
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

/** Snapshot de un ítem cargado, para poder reimprimir el detalle en el PDF */
export interface DetalleItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  ivaPorcentaje: number;
  subtotalNeto: number;
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

  /**
   * Snapshot de los ítems al momento de emitir, para el detalle del PDF.
   * Nullable: los comprobantes emitidos antes de esta columna no lo tienen
   * (el generador de PDF tiene que tolerarlo, igual que con `ivaDesglose`).
   */
  @Column({ type: 'jsonb', nullable: true })
  detalle?: DetalleItem[];

  /**
   * Fecha de emisión tal como se envió a ARCA (CbteFch), formato AAAA-MM-DD.
   * Nullable por la misma razón que `detalle`.
   */
  @Column({ type: 'date', nullable: true })
  fecha?: string;

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
   * Information Expert: calcula neto e IVA de una línea según qué representa
   * el `precioUnitario` en ese tipo de comprobante — confirmado contra el
   * facturador de ARCA:
   * - Factura A: el precio es NETO (sin IVA). Se SUMA el IVA.
   * - Factura B (y C): el precio ya viene CON IVA incluido. Se EXTRAE el neto.
   * No redondea: el redondeo se hace una sola vez, por alícuota ya agrupada
   * (ver `calcularDesglose`), para no arrastrar error de redondeo línea a línea.
   */
  static calcularImportesLinea(
    tipoFactura: TipoFacturaDominio,
    cantidad: number,
    precioUnitario: number,
    ivaPorcentaje: number,
  ): { neto: number; iva: number } {
    const importe = cantidad * precioUnitario;
    if (tipoFactura === 'A') {
      const neto = importe;
      return { neto, iva: neto * (ivaPorcentaje / 100) };
    }
    // B (y C): el precio cargado ya incluye el IVA.
    const neto = importe / (1 + ivaPorcentaje / 100);
    return { neto, iva: importe - neto };
  }

  /**
   * Information Expert: agrupa los ítems cargados por alícuota y calcula neto
   * e IVA de cada grupo. ARCA pide el IVA discriminado por alícuota, no por
   * línea de venta. Se acumula SIN redondear y se redondea recién al cerrar
   * cada grupo, para cuadrar con lo que espera ARCA.
   */
  static calcularDesglose(
    tipoFactura: TipoFacturaDominio,
    items: ItemCargado[],
  ): AlicuotaDesglose[] {
    const porAlicuota = new Map<number, { neto: number; iva: number }>();
    for (const item of items) {
      const ivaPorcentaje = item.ivaPorcentaje ?? IVA_DEFECTO;
      const { neto, iva } = Comprobante.calcularImportesLinea(
        tipoFactura,
        item.cantidad,
        item.precioUnitario,
        ivaPorcentaje,
      );
      const acumulado = porAlicuota.get(ivaPorcentaje) ?? { neto: 0, iva: 0 };
      acumulado.neto += neto;
      acumulado.iva += iva;
      porAlicuota.set(ivaPorcentaje, acumulado);
    }
    return [...porAlicuota.entries()].map(([alicuotaPorcentaje, v]) => ({
      alicuotaPorcentaje,
      neto: redondear(v.neto),
      iva: redondear(v.iva),
    }));
  }

  /**
   * Information Expert: arma el snapshot de ítems para el detalle del PDF.
   * A diferencia de `calcularDesglose`, acá no se agrupa por alícuota: se
   * conserva una línea por ítem cargado (con su descripción). El
   * `subtotalNeto` es siempre el neto (sin IVA), extraído del precio cargado
   * si el tipo de comprobante lo trae con IVA incluido.
   */
  static armarDetalle(
    tipoFactura: TipoFacturaDominio,
    items: ({ descripcion: string } & ItemCargado)[],
  ): DetalleItem[] {
    return items.map((item) => {
      const ivaPorcentaje = item.ivaPorcentaje ?? IVA_DEFECTO;
      const { neto } = Comprobante.calcularImportesLinea(
        tipoFactura,
        item.cantidad,
        item.precioUnitario,
        ivaPorcentaje,
      );
      return {
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        ivaPorcentaje,
        subtotalNeto: redondear(neto),
      };
    });
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
      detalle?: DetalleItem[];
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
    comprobante.detalle = datos.detalle;
    comprobante.fecha = formatearFechaColumna(resultado.fecha);
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
        detalle: this.detalle,
      },
      this.ivaDesglose!,
      resultado,
    );
    notaCredito.comprobanteOriginalId = this.id;
    this.estado = 'anulado';
    return notaCredito;
  }

  /** Letra impresa del comprobante (A/B/C). Factura y su NC comparten letra. */
  letra(): string {
    return LETRA_POR_CODIGO[this.tipoComprobante] ?? '?';
  }

  /** "Factura B" / "Nota de Crédito B" según corresponda, para el título del PDF */
  tipoDocumentoTexto(): string {
    const nombre = NOMBRE_POR_CODIGO[this.tipoComprobante] ?? 'Comprobante';
    return `${nombre} ${this.letra()}`;
  }

  /** Nombre de archivo sugerido para el PDF, ej. comprobante-B-0002-00000004.pdf */
  nombreArchivoPdf(): string {
    const ptoVta = String(this.puntoVenta).padStart(4, '0');
    const numero = String(this.numero).padStart(8, '0');
    return `comprobante-${this.letra()}-${ptoVta}-${numero}.pdf`;
  }

  /**
   * Arma la URL del QR oficial (RG 4892) tal como la exige ARCA: el dominio
   * sigue siendo afip.gob.ar/fe/qr aunque el organismo hoy se llame ARCA.
   * Pura: no hace I/O, no genera la imagen (eso lo hace el adapter de PDF con
   * la librería `qrcode`). Information Expert: necesita datos del comprobante
   * (número, tipo, importe, receptor, CAE) y del emisor (CUIT).
   */
  static construirUrlQr(comprobante: Comprobante, emisor: Emisor): string {
    if (!comprobante.fecha) {
      throw new Error(
        'El comprobante no tiene fecha guardada: no se puede armar el QR',
      );
    }
    const payload = {
      ver: 1,
      fecha: comprobante.fecha,
      cuit: emisor.cuit,
      ptoVta: comprobante.puntoVenta,
      tipoCmp: comprobante.tipoComprobante,
      nroCmp: comprobante.numero,
      importe: Number(comprobante.importeTotal),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: comprobante.docTipoReceptor,
      nroDocRec: Number(comprobante.docNroReceptor),
      tipoCodAut: 'E',
      codAut: Number(comprobante.cae),
    };
    const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
  }
}
