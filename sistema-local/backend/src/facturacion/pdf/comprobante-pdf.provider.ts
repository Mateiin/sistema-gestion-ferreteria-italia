import pdfMake = require('pdfmake');
import helvetica = require('pdfmake/standard-fonts/Helvetica');
import * as QRCode from 'qrcode';
import { Comprobante } from '../modelo/comprobante.entity';
import { AlicuotaDesglose } from '../interfaces/arca-provider.interface';
import { Emisor } from '../config/emisor';
import {
  CONDICION_IVA_RECEPTOR_LEGIBLE,
  CONDICION_VENTA_LEGIBLE,
  DesgloseAlicuotaArca,
  FilaItemArca,
  armarEncabezadoArca,
  armarPieAutorizadoArca,
  armarReceptorArca,
  armarTablaItemsArca,
  armarTotalesArca,
  formatearReceptorDoc,
  stylesArca,
} from './formato-arca';

pdfMake.addFonts(helvetica);
// Bloqueamos que pdfmake vaya a buscar recursos por URL: los únicos "recursos
// externos" que usamos son el QR y el logo del emisor, y los embebemos como
// dataURL, no como URL.
pdfMake.setUrlAccessPolicy(() => false);
// El acceso "local" lo necesita el propio pdfmake para resolver las fuentes
// estándar (Helvetica-Bold, etc.), no es un path controlado por el usuario:
// ningún campo del docDefinition usa una imagen que no sea el QR o el logo,
// ambos ya resueltos a dataURL antes de llegar acá.
pdfMake.setLocalAccessPolicy(() => true);

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' */
function formatearFechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** 'AAAAMMDD' (como lo devuelve ARCA) -> 'DD/MM/AAAA' */
function formatearVencimientoCae(vencimiento: string): string {
  return `${vencimiento.slice(6, 8)}/${vencimiento.slice(4, 6)}/${vencimiento.slice(0, 4)}`;
}

/**
 * ADAPTER: renderiza un `Comprobante` ya persistido a PDF con pdfmake,
 * siguiendo el molde oficial de ARCA (encabezado con letra, franja del
 * receptor, tabla de ítems de 9 columnas y bloque de totales), con el QR
 * oficial embebido. No hace I/O de base de datos ni de ARCA: recibe el
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
    // "Factura B" -> "FACTURA" (la letra ya se muestra aparte, en el recuadro).
    const tituloDocumento = comprobante
      .tipoDocumentoTexto()
      .split(' ')
      .slice(0, -1)
      .join(' ')
      .toUpperCase();

    return {
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      pageMargins: [30, 30, 30, 30] as [number, number, number, number],
      content: [
        armarEncabezadoArca({
          letra,
          codigo: codigoTexto,
          tituloDocumento,
          puntoVenta: comprobante.puntoVenta,
          numeroComprobante: String(comprobante.numero).padStart(8, '0'),
          etiquetaNumero: 'Comp. Nro',
          fechaEmision: comprobante.fecha ? formatearFechaLegible(comprobante.fecha) : '-',
          emisor: {
            razonSocial: emisor.razonSocial,
            logoDataUrl: emisor.logoDataUrl,
            cuit: emisor.cuit,
            condicionIva: emisor.condicionIva,
            domicilioComercial: emisor.domicilioComercial,
            ingresosBrutos: emisor.ingresosBrutos,
            inicioActividades: emisor.inicioActividades,
          },
        }),
        armarReceptorArca({
          documento: formatearReceptorDoc(
            comprobante.docTipoReceptor,
            Number(comprobante.docNroReceptor),
          ),
          razonSocial: comprobante.razonSocialReceptor,
          condicionIva: comprobante.condicionIvaReceptor
            ? CONDICION_IVA_RECEPTOR_LEGIBLE[comprobante.condicionIvaReceptor] ??
              comprobante.condicionIvaReceptor
            : undefined,
          domicilio: comprobante.domicilioReceptor,
          condicionVenta: comprobante.condicionVenta
            ? CONDICION_VENTA_LEGIBLE[comprobante.condicionVenta] ?? comprobante.condicionVenta
            : undefined,
        }),
        armarTablaItemsArca(this.armarFilasItems(comprobante, esA)),
        { text: ' ', margin: [0, 6, 0, 0] as [number, number, number, number] },
        armarTotalesArca({
          esA,
          neto: Number(comprobante.importeNeto),
          desglose: this.armarDesgloseTotales(comprobante),
          total: Number(comprobante.importeTotal),
        }),
        armarPieAutorizadoArca({
          qrDataUrl,
          cae: comprobante.cae,
          vencimientoCae: formatearVencimientoCae(comprobante.vencimientoCae),
        }),
      ],
      styles: stylesArca,
    };
  }

  /**
   * Arma las filas de la tabla de ítems. En Factura B el "Precio Unit." y el
   * "Subtotal" se muestran con el IVA incluido (no se discrimina, va en el
   * precio); en Factura A se muestran en NETO, igual que se cargan. El dato
   * de origen (`precioUnitario`/`subtotalNeto`) es siempre NETO en los dos
   * casos (ver `Comprobante.calcularImportesLinea`) — acá solo se decide qué
   * mostrar impreso, no se recalcula nada de negocio.
   *
   * Si el comprobante no tiene el snapshot de ítems (emitido antes de
   * guardar `detalle`), se arma una fila por alícuota a partir de
   * `ivaDesglose`, para no romper la reimpresión de comprobantes viejos.
   */
  private armarFilasItems(comprobante: Comprobante, esA: boolean): FilaItemArca[] {
    if (comprobante.detalle && comprobante.detalle.length > 0) {
      return comprobante.detalle.map((item) => {
        const factorConIva = 1 + item.ivaPorcentaje / 100;
        const precioUnitario = esA ? item.precioUnitario : item.precioUnitario * factorConIva;
        const subtotal = esA ? item.subtotalNeto : item.subtotalNeto * factorConIva;
        return {
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidadMedida: item.unidadMedida,
          precioUnitario,
          subtotal,
          ivaPorcentaje: item.ivaPorcentaje,
          subtotalConIva: item.subtotalNeto * factorConIva,
        };
      });
    }

    return (comprobante.ivaDesglose ?? []).map((d: AlicuotaDesglose) => ({
      descripcion: `Importe gravado al ${d.alicuotaPorcentaje}%`,
      subtotal: d.neto,
      ivaPorcentaje: d.alicuotaPorcentaje,
      subtotalConIva: d.neto + d.iva,
    }));
  }

  private armarDesgloseTotales(comprobante: Comprobante): DesgloseAlicuotaArca[] {
    return (comprobante.ivaDesglose ?? []).map((d: AlicuotaDesglose) => ({
      alicuotaPorcentaje: d.alicuotaPorcentaje,
      iva: d.iva,
    }));
  }
}

export const crearComprobantePdfProvider = (): ComprobantePdfProvider =>
  new ComprobantePdfProvider();
