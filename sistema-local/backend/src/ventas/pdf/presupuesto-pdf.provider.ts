import pdfMake = require('pdfmake');
import helvetica = require('pdfmake/standard-fonts/Helvetica');
import { Venta } from '../modelo/venta.entity';
import { Emisor } from '../../facturacion/config/emisor';
import {
  CONDICION_IVA_RECEPTOR_LEGIBLE,
  DesgloseAlicuotaArca,
  FilaItemArca,
  armarEncabezadoArca,
  armarReceptorArca,
  armarTablaItemsArca,
  armarTotalesArca,
  formatearReceptorDoc,
  stylesArca,
} from '../../facturacion/pdf/formato-arca';

pdfMake.addFonts(helvetica);
// Mismo criterio de seguridad que comprobante-pdf.provider.ts: sin recursos
// externos que no sea el logo del emisor, ya resuelto a dataURL antes de
// llegar acá. El presupuesto no tiene QR (no es fiscal).
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => true);

function formatearFechaHoy(): string {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, '0');
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${hoy.getFullYear()}`;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ADAPTER: renderiza una `Venta` (ficha) a un PDF de presupuesto, NO fiscal
 * (sin CAE, sin QR), con el mismo molde de ARCA que la factura (encabezado,
 * receptor, tabla de ítems de 9 columnas y totales) para que se vea como el
 * resto de los comprobantes del sistema. Traductor puro, arma desde la Venta
 * y su Cliente ya resueltos (se los da el Gestor) más el `Emisor` (para el
 * encabezado); no calcula nada de negocio que `Venta.total()` no haya
 * calculado ya — el desglose por alícuota de acá es solo para IMPRIMIR el
 * total con IVA (mismo criterio que `Comprobante.calcularDesglose`, pero no
 * se persiste ni decide nada: es de exhibición, el precio real se fija al
 * facturar). No depende de `Comprobante` en absoluto.
 */
export class PresupuestoPdfProvider {
  async generar(venta: Venta, emisor: Emisor): Promise<Buffer> {
    const documento = pdfMake.createPdf(this.armarDocDefinition(venta, emisor));
    return documento.getBuffer();
  }

  private armarDocDefinition(venta: Venta, emisor: Emisor) {
    const cliente = venta.cliente;
    const esA = cliente.tipoFacturaCorrespondiente() === 'A';
    const lineas = venta.lineas ?? [];

    return {
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      pageMargins: [30, 30, 30, 30] as [number, number, number, number],
      content: [
        armarEncabezadoArca({
          letra: cliente.tipoFacturaCorrespondiente(),
          tituloDocumento: 'PRESUPUESTO',
          puntoVenta: emisor.puntoVenta,
          numeroComprobante: venta.id.slice(0, 8).toUpperCase(),
          etiquetaNumero: 'Ficha Nro',
          fechaEmision: formatearFechaHoy(),
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
        {
          text: 'Documento no válido como factura',
          style: 'aviso',
          margin: [0, 0, 0, 8] as [number, number, number, number],
        },
        armarReceptorArca({
          documento: formatearReceptorDoc(cliente.docTipo, Number(cliente.docNro)),
          razonSocial: cliente.razonSocial,
          condicionIva: CONDICION_IVA_RECEPTOR_LEGIBLE[cliente.condicionIva] ?? cliente.condicionIva,
          domicilio: cliente.domicilio,
          condicionVenta: 'A definir al facturar',
        }),
        armarTablaItemsArca(this.armarFilasItems(lineas, esA)),
        { text: ' ', margin: [0, 6, 0, 0] as [number, number, number, number] },
        armarTotalesArca({
          esA,
          neto: venta.total(),
          desglose: this.armarDesgloseTotales(lineas),
          total: this.calcularTotalConIva(lineas),
        }),
      ],
      styles: {
        ...stylesArca,
        aviso: { fontSize: 10, italics: true, color: '#a83232' },
      },
    };
  }

  private armarFilasItems(
    lineas: Venta['lineas'],
    esA: boolean,
  ): FilaItemArca[] {
    return lineas.map((linea) => {
      const cantidad = Number(linea.cantidad);
      const precioUnitarioNeto = Number(linea.precioUnitario);
      const subtotalNeto = cantidad * precioUnitarioNeto;
      const factorConIva = 1 + Number(linea.ivaPorcentaje) / 100;
      return {
        descripcion: linea.descripcion,
        cantidad,
        unidadMedida: linea.unidadMedida,
        precioUnitario: esA ? precioUnitarioNeto : precioUnitarioNeto * factorConIva,
        subtotal: esA ? subtotalNeto : subtotalNeto * factorConIva,
        ivaPorcentaje: linea.ivaPorcentaje,
        subtotalConIva: subtotalNeto * factorConIva,
      };
    });
  }

  /** Agrupa por alícuota igual que `Comprobante.calcularDesglose`, solo para imprimir el total. */
  private armarDesgloseTotales(lineas: Venta['lineas']): DesgloseAlicuotaArca[] {
    const porAlicuota = new Map<number, number>();
    for (const linea of lineas) {
      const neto = Number(linea.cantidad) * Number(linea.precioUnitario);
      const iva = neto * (Number(linea.ivaPorcentaje) / 100);
      const alicuota = Number(linea.ivaPorcentaje);
      porAlicuota.set(alicuota, (porAlicuota.get(alicuota) ?? 0) + iva);
    }
    return [...porAlicuota.entries()].map(([alicuotaPorcentaje, iva]) => ({
      alicuotaPorcentaje,
      iva: redondear(iva),
    }));
  }

  private calcularTotalConIva(lineas: Venta['lineas']): number {
    const total = lineas.reduce((acc, linea) => {
      const neto = Number(linea.cantidad) * Number(linea.precioUnitario);
      return acc + neto * (1 + Number(linea.ivaPorcentaje) / 100);
    }, 0);
    return redondear(total);
  }
}

export const crearPresupuestoPdfProvider = (): PresupuestoPdfProvider =>
  new PresupuestoPdfProvider();
