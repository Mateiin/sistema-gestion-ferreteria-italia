import pdfMake = require('pdfmake');
import helvetica = require('pdfmake/standard-fonts/Helvetica');
import { Venta } from '../modelo/venta.entity';

pdfMake.addFonts(helvetica);
// Mismo criterio de seguridad que comprobante-pdf.provider.ts: sin recursos
// externos, el presupuesto no tiene imágenes (ni QR, no es fiscal).
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => true);

/** Catálogo ARCA de unidades de medida, mismo subconjunto que el PDF de facturación */
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

function formatearUnidad(codigo: number): string {
  return UNIDAD_MEDIDA_LEGIBLE[codigo] ?? `Cód. ${codigo}`;
}

function formatearMoneda(n: number): string {
  return Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatearDoc(docTipo: number, docNro: number): string {
  if (docTipo === 99) return 'Consumidor Final';
  const etiqueta = docTipo === 80 ? 'CUIT' : docTipo === 96 ? 'DNI' : `Doc. tipo ${docTipo}`;
  return `${etiqueta}: ${docNro}`;
}

function formatearFechaHoy(): string {
  return new Date().toLocaleDateString('es-AR');
}

/**
 * ADAPTER: renderiza una `Venta` (ficha) a un PDF de presupuesto, NO fiscal
 * (sin CAE, sin QR). Traductor puro, arma desde la Venta y su Cliente ya
 * resueltos (se los da el Gestor); no calcula nada de negocio que `Venta.total()`
 * no haya calculado ya. Reusa la misma librería (pdfmake) y estilos generales
 * que `comprobante-pdf.provider.ts`, pero es un provider aparte: no depende
 * de `Comprobante` en absoluto.
 */
export class PresupuestoPdfProvider {
  async generar(venta: Venta): Promise<Buffer> {
    const documento = pdfMake.createPdf(this.armarDocDefinition(venta));
    return documento.getBuffer();
  }

  private armarDocDefinition(venta: Venta) {
    const cliente = venta.cliente;
    return {
      defaultStyle: { font: 'Helvetica', fontSize: 9 },
      pageMargins: [30, 30, 30, 30] as [number, number, number, number],
      content: [
        { text: 'PRESUPUESTO', style: 'titulo' },
        {
          text: 'Documento no válido como factura',
          style: 'aviso',
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
        { text: `Fecha: ${formatearFechaHoy()}` },
        { text: ' ', margin: [0, 5, 0, 0] as [number, number, number, number] },
        { text: 'Cliente', style: 'seccion' },
        { text: cliente.razonSocial },
        { text: formatearDoc(cliente.docTipo, Number(cliente.docNro)) },
        { text: ' ', margin: [0, 5, 0, 0] as [number, number, number, number] },
        { text: 'Detalle', style: 'seccion' },
        this.armarTablaLineas(venta),
        { text: ' ', margin: [0, 10, 0, 0] as [number, number, number, number] },
        {
          alignment: 'right' as const,
          text: `Total: $ ${formatearMoneda(venta.total())}`,
          style: 'total',
        },
      ],
      styles: {
        titulo: { fontSize: 16, bold: true },
        aviso: { fontSize: 10, italics: true, color: '#a83232' },
        seccion: { fontSize: 10, bold: true, decoration: 'underline' },
        total: { fontSize: 12, bold: true },
      },
    };
  }

  private armarTablaLineas(venta: Venta) {
    const encabezado = ['Descripción', 'Cantidad', 'Unidad', 'P. Unitario', 'Subtotal'].map(
      (texto) => ({ text: texto, bold: true }),
    );

    const filas = (venta.lineas ?? []).map((linea) => {
      const cantidad = Number(linea.cantidad);
      const precioUnitario = Number(linea.precioUnitario);
      return [
        linea.descripcion,
        String(cantidad),
        formatearUnidad(linea.unidadMedida),
        `$ ${formatearMoneda(precioUnitario)}`,
        `$ ${formatearMoneda(cantidad * precioUnitario)}`,
      ];
    });

    return {
      table: {
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [encabezado, ...(filas.length > 0 ? filas : [['(sin líneas)', '', '', '', '']])],
      },
    };
  }
}

export const crearPresupuestoPdfProvider = (): PresupuestoPdfProvider =>
  new PresupuestoPdfProvider();
