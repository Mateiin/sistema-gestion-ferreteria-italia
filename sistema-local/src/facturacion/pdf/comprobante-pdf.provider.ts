import pdfMake = require('pdfmake');
import helvetica = require('pdfmake/standard-fonts/Helvetica');
import * as QRCode from 'qrcode';
import { Comprobante } from '../modelo/comprobante.entity';
import { AlicuotaDesglose } from '../interfaces/arca-provider.interface';
import { Emisor } from '../config/emisor';

pdfMake.addFonts(helvetica);
// Bloqueamos que pdfmake vaya a buscar recursos por URL: el único "recurso
// externo" que usamos es el QR, y lo embebemos como dataURL, no como URL.
pdfMake.setUrlAccessPolicy(() => false);
// El acceso "local" lo necesita el propio pdfmake para resolver las fuentes
// estándar (Helvetica-Bold, etc.), no es un path controlado por el usuario:
// ningún campo del docDefinition usa una imagen que no sea el QR que
// generamos nosotros mismos.
pdfMake.setLocalAccessPolicy(() => true);

const CONDICION_IVA_LEGIBLE: Record<string, string> = {
  RI: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributista',
};

/** Condición de IVA del RECEPTOR (dominio más amplio que la del emisor) */
const CONDICION_IVA_RECEPTOR_LEGIBLE: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
};

const CONDICION_VENTA_LEGIBLE: Record<string, string> = {
  CONTADO: 'Contado',
  TARJETA_DEBITO: 'Tarjeta de Débito',
  TARJETA_CREDITO: 'Tarjeta de Crédito',
  CUENTA_CORRIENTE: 'Cuenta Corriente',
  CHEQUE: 'Cheque',
  TRANSFERENCIA_BANCARIA: 'Transferencia Bancaria',
  OTRA: 'Otra',
};

/** Catálogo ARCA de unidades de medida (FEParamGetTiposUnidadesMedida) — solo
 * las de uso común en una ferretería; el resto se muestra como "Cód. N". */
const UNIDAD_MEDIDA_LEGIBLE: Record<number, string> = {
  1: 'kg',
  2: 'm',
  3: 'm³',
  4: 'l',
  5: 'km',
  7: 'unidades',
  9: 'docena',
  41: 'm²',
  96: 'otras',
};

/** Mismo default que `Comprobante.armarDetalle`, para comprobantes viejos
 * cuyo `detalle` persistido no tiene `unidadMedida` (columna agregada después). */
const UNIDAD_MEDIDA_DEFECTO = 7;

function formatearUnidad(codigo: number): string {
  return UNIDAD_MEDIDA_LEGIBLE[codigo] ?? `Cód. ${codigo}`;
}

function formatearMoneda(n: number): string {
  return Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' */
function formatearFechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** 'AAAAMMDD' (como lo devuelve ARCA) -> 'DD/MM/AAAA' */
function formatearVencimientoCae(vencimiento: string): string {
  return `${vencimiento.slice(6, 8)}/${vencimiento.slice(4, 6)}/${vencimiento.slice(0, 4)}`;
}

function formatearReceptor(docTipo: number, docNro: number): string {
  if (docTipo === 99) return 'Consumidor Final';
  const etiqueta = docTipo === 80 ? 'CUIT' : docTipo === 96 ? 'DNI' : `Doc. tipo ${docTipo}`;
  return `${etiqueta}: ${docNro}`;
}

/**
 * ADAPTER: renderiza un `Comprobante` ya persistido a PDF con pdfmake, con el
 * QR oficial embebido. No hace I/O de base de datos ni de ARCA: recibe el
 * `Comprobante` y el `Emisor` ya resueltos (se los da el Gestor) y devuelve
 * bytes. No calcula nada de negocio: eso ya lo hizo el Modelo antes.
 */
export class ComprobantePdfProvider {
  async generar(comprobante: Comprobante, emisor: Emisor): Promise<Buffer> {
    const urlQr = Comprobante.construirUrlQr(comprobante, emisor);
    const qrDataUrl = await QRCode.toDataURL(urlQr);

    const documento = pdfMake.createPdf(
      this.armarDocDefinition(comprobante, emisor, qrDataUrl),
    );
    return documento.getBuffer();
  }

  private armarDocDefinition(
    comprobante: Comprobante,
    emisor: Emisor,
    qrDataUrl: string,
  ) {
    const letra = comprobante.letra();
    const esA = letra === 'A';
    const codigoTexto = String(comprobante.tipoComprobante).padStart(2, '0');
    const numeroFormateado = `${String(comprobante.puntoVenta).padStart(4, '0')}-${String(comprobante.numero).padStart(8, '0')}`;

    return {
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      pageMargins: [30, 30, 30, 30] as [number, number, number, number],
      content: [
        {
          columns: [
            [
              { text: emisor.razonSocial, style: 'titulo' },
              { text: `CUIT: ${emisor.cuit}` },
              {
                text: `Condición frente al IVA: ${CONDICION_IVA_LEGIBLE[emisor.condicionIva] ?? emisor.condicionIva}`,
              },
              { text: `Domicilio comercial: ${emisor.domicilioComercial ?? '-'}` },
              { text: `Ingresos Brutos: ${emisor.ingresosBrutos ?? '-'}` },
              { text: `Inicio de actividades: ${emisor.inicioActividades ?? '-'}` },
              { text: `Punto de venta: ${String(comprobante.puntoVenta).padStart(4, '0')}` },
            ],
            {
              width: 90,
              stack: [
                { text: letra, style: 'letraRecuadro' },
                { text: `Cód. ${codigoTexto}`, alignment: 'center' as const },
              ],
            },
          ],
        },
        {
          text: `${comprobante.tipoDocumentoTexto()} — Comprobante Nº ${numeroFormateado}`,
          style: 'subtitulo',
          margin: [0, 10, 0, 0] as [number, number, number, number],
        },
        {
          text: `Fecha de emisión: ${comprobante.fecha ? formatearFechaLegible(comprobante.fecha) : '-'}`,
        },
        {
          text: `Condición de venta: ${
            (comprobante.condicionVenta &&
              CONDICION_VENTA_LEGIBLE[comprobante.condicionVenta]) ??
            comprobante.condicionVenta ??
            '-'
          }`,
        },
        { text: ' ', margin: [0, 5, 0, 0] as [number, number, number, number] },
        { text: 'Receptor', style: 'seccion' },
        {
          text: formatearReceptor(
            comprobante.docTipoReceptor,
            Number(comprobante.docNroReceptor),
          ),
        },
        esA
          ? {
              text: `Condición frente al IVA: ${
                (comprobante.condicionIvaReceptor &&
                  CONDICION_IVA_RECEPTOR_LEGIBLE[comprobante.condicionIvaReceptor]) ??
                comprobante.condicionIvaReceptor ??
                '-'
              }`,
            }
          : null,
        { text: ' ', margin: [0, 5, 0, 0] as [number, number, number, number] },
        { text: 'Detalle', style: 'seccion' },
        this.armarTablaItems(comprobante),
        { text: ' ', margin: [0, 5, 0, 0] as [number, number, number, number] },
        this.armarTotales(comprobante, esA),
        { text: ' ', margin: [0, 10, 0, 0] as [number, number, number, number] },
        { text: `CAE: ${comprobante.cae}` },
        { text: `Vencimiento CAE: ${formatearVencimientoCae(comprobante.vencimientoCae)}` },
        {
          text: 'Comprobante Autorizado',
          style: 'autorizado',
          margin: [0, 5, 0, 10] as [number, number, number, number],
        },
        { image: qrDataUrl, width: 120 },
      ].filter((item) => item !== null),
      styles: {
        titulo: { fontSize: 13, bold: true },
        subtitulo: { fontSize: 11, bold: true },
        seccion: { fontSize: 10, bold: true, decoration: 'underline' },
        letraRecuadro: { fontSize: 28, bold: true, alignment: 'center' },
        autorizado: { bold: true },
      },
    };
  }

  /**
   * Si el comprobante tiene el snapshot de ítems, arma la tabla detallada.
   * Si no (comprobantes emitidos antes de guardar `detalle`), muestra el
   * desglose por alícuota disponible y una nota, en vez de romper.
   */
  private armarTablaItems(comprobante: Comprobante) {
    const encabezado = [
      'Descripción',
      'Cantidad',
      'Unidad',
      'P. Unitario',
      'Alícuota',
      'Importe',
    ].map((texto) => ({ text: texto, bold: true }));

    if (comprobante.detalle && comprobante.detalle.length > 0) {
      return {
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            encabezado,
            ...comprobante.detalle.map((item) => [
              item.descripcion,
              String(item.cantidad),
              formatearUnidad(item.unidadMedida ?? UNIDAD_MEDIDA_DEFECTO),
              `$ ${formatearMoneda(item.precioUnitario)}`,
              `${item.ivaPorcentaje}%`,
              `$ ${formatearMoneda(item.subtotalNeto)}`,
            ]),
          ],
        },
      };
    }

    const filas = (comprobante.ivaDesglose ?? []).map((d: AlicuotaDesglose) => [
      `Importe gravado al ${d.alicuotaPorcentaje}%`,
      '',
      '',
      '',
      `${d.alicuotaPorcentaje}%`,
      `$ ${formatearMoneda(d.neto)}`,
    ]);

    return {
      stack: [
        {
          text: 'Detalle de ítems no disponible para este comprobante (emitido antes de guardar el detalle).',
          italics: true,
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              encabezado,
              ...(filas.length > 0 ? filas : [['(sin datos)', '', '', '', '', '']]),
            ],
          },
        },
      ],
    };
  }

  /** IVA se discrimina SOLO en Factura A; en B el total ya lo incluye. */
  private armarTotales(comprobante: Comprobante, esA: boolean) {
    if (!esA) {
      return {
        alignment: 'right' as const,
        text: `Total: $ ${formatearMoneda(comprobante.importeTotal)}`,
        style: 'autorizado',
      };
    }

    const filasIva = (comprobante.ivaDesglose ?? []).map(
      (d: AlicuotaDesglose) => `IVA ${d.alicuotaPorcentaje}%: $ ${formatearMoneda(d.iva)}`,
    );

    return {
      alignment: 'right' as const,
      stack: [
        { text: `Neto gravado: $ ${formatearMoneda(comprobante.importeNeto)}` },
        ...filasIva.map((texto) => ({ text: texto })),
        { text: `Total: $ ${formatearMoneda(comprobante.importeTotal)}`, style: 'autorizado' },
      ],
    };
  }
}

export const crearComprobantePdfProvider = (): ComprobantePdfProvider =>
  new ComprobantePdfProvider();
