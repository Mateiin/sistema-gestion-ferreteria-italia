/**
 * ADAPTER de layout, compartido entre `comprobante-pdf.provider.ts` (factura/NC,
 * con CAE) y `ventas/pdf/presupuesto-pdf.provider.ts` (presupuesto, no fiscal).
 * Arma los bloques del molde oficial de ARCA (encabezado con letra y datos del
 * emisor, franja del receptor, tabla de ítems y bloque de totales) como
 * fragmentos de `docDefinition` de pdfmake. Puro traductor de layout: no
 * calcula neto/IVA ni decide nada de negocio, solo formatea lo que cada
 * provider ya calculó (`Comprobante`/`Venta` son quienes calculan).
 */

export const CONDICION_IVA_EMISOR_LEGIBLE: Record<string, string> = {
  RI: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributista',
};

/** Condición de IVA del RECEPTOR (dominio más amplio que la del emisor) */
export const CONDICION_IVA_RECEPTOR_LEGIBLE: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributista',
  EXENTO: 'Exento',
  CONSUMIDOR_FINAL: 'Consumidor Final',
};

export const CONDICION_VENTA_LEGIBLE: Record<string, string> = {
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

/** Alícuotas que el formulario oficial de una Factura A lista siempre en el
 * bloque de totales, en 0,00 si el comprobante no las usó. */
const ALICUOTAS_TOTALES_ORDEN = [27, 21, 10.5, 5, 2.5, 0];

export function formatearUnidad(codigo: number): string {
  return UNIDAD_MEDIDA_LEGIBLE[codigo] ?? `Cód. ${codigo}`;
}

export function formatearMoneda(n: number): string {
  return Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatearReceptorDoc(docTipo: number, docNro: number): string {
  if (docTipo === 99) return 'Consumidor Final';
  const etiqueta = docTipo === 80 ? 'CUIT' : docTipo === 96 ? 'DNI' : `Doc. tipo ${docTipo}`;
  return `${etiqueta}: ${docNro}`;
}

export interface EncabezadoArcaDatos {
  letra: string;
  /** Código ARCA de 2 dígitos ("01", "06"...). Sin código (presupuesto) no se
   * imprime la línea "Cód." bajo la letra. */
  codigo?: string;
  /** 'FACTURA' | 'NOTA DE CRÉDITO' | 'PRESUPUESTO' */
  tituloDocumento: string;
  puntoVenta: number;
  /** Ya formateado (8 dígitos para comprobantes fiscales, u otra referencia para presupuestos). */
  numeroComprobante: string;
  etiquetaNumero: string;
  fechaEmision: string;
  emisor: {
    razonSocial: string;
    /** dataURL (base64) del logo del emisor. Si falta, se cae al texto de la razón social. */
    logoDataUrl?: string;
    cuit: number;
    condicionIva: string;
    domicilioComercial?: string;
    ingresosBrutos?: string;
    inicioActividades?: string;
  };
}

/** Encabezado en dos bloques (emisor / comprobante) separados por la letra
 * en un recuadro central, con "ORIGINAL" y "1/1" arriba — igual al formulario
 * oficial de ARCA. Es una `table` de pdfmake (no un `canvas`) para que las
 * líneas divisorias se adapten solas a la altura del contenido. */
export function armarEncabezadoArca(datos: EncabezadoArcaDatos) {
  const bloqueEmisor = datos.emisor.logoDataUrl
    ? { image: datos.emisor.logoDataUrl, width: 140, margin: [0, 0, 0, 4] as [number, number, number, number] }
    : { text: datos.emisor.razonSocial, style: 'tituloEmisor' as const };

  return {
    stack: [
      {
        columns: [
          { text: '', width: '*' },
          { text: 'ORIGINAL', alignment: 'center' as const, bold: true, fontSize: 10, width: '*' },
          { text: '1/1', alignment: 'right' as const, width: '*' },
        ],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          widths: ['*', 65, 200],
          body: [
            [
              {
                stack: [
                  bloqueEmisor,
                  { text: `Razón Social: ${datos.emisor.razonSocial}` },
                  { text: `Domicilio Comercial: ${datos.emisor.domicilioComercial ?? '-'}` },
                  {
                    text: `Condición frente al IVA: ${
                      CONDICION_IVA_EMISOR_LEGIBLE[datos.emisor.condicionIva] ?? datos.emisor.condicionIva
                    }`,
                  },
                ],
              },
              {
                stack: [
                  { text: datos.letra, style: 'letraRecuadro' as const },
                  datos.codigo ? { text: `Cód. ${datos.codigo}`, alignment: 'center' as const, fontSize: 8 } : null,
                ].filter((item) => item !== null),
              },
              {
                stack: [
                  { text: datos.tituloDocumento, style: 'tituloDocumento' as const },
                  { text: `Punto de Venta: ${String(datos.puntoVenta).padStart(4, '0')}` },
                  { text: `${datos.etiquetaNumero}: ${datos.numeroComprobante}` },
                  { text: `Fecha de Emisión: ${datos.fechaEmision}` },
                  { text: `CUIT: ${datos.emisor.cuit}` },
                  { text: `Ingresos Brutos: ${datos.emisor.ingresosBrutos ?? '-'}` },
                  { text: `Fecha de Inicio de Actividades: ${datos.emisor.inicioActividades ?? '-'}` },
                ],
              },
            ],
          ],
        },
      },
    ],
  };
}

export interface ReceptorArcaDatos {
  /** Ya formateado (CUIT/DNI/Consumidor Final), ver `formatearReceptorDoc`. */
  documento: string;
  razonSocial?: string;
  condicionIva?: string;
  domicilio?: string;
  condicionVenta?: string;
}

/** Franja de datos del receptor, en un recuadro debajo del encabezado. */
export function armarReceptorArca(datos: ReceptorArcaDatos) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: datos.documento },
              { text: `Apellido y Nombre / Razón Social: ${datos.razonSocial ?? '-'}` },
              { text: `Condición frente al IVA: ${datos.condicionIva ?? '-'}` },
              { text: `Domicilio Comercial: ${datos.domicilio ?? '-'}` },
              { text: `Condición de venta: ${datos.condicionVenta ?? '-'}` },
            ],
            margin: [2, 2, 2, 2] as [number, number, number, number],
          },
        ],
      ],
    },
    margin: [0, 8, 0, 8] as [number, number, number, number],
  };
}

export interface FilaItemArca {
  codigo?: string;
  descripcion: string;
  cantidad?: number | string;
  unidadMedida?: number;
  precioUnitario?: number;
  bonifPorcentaje?: number;
  subtotal?: number;
  ivaPorcentaje?: number | string;
  subtotalConIva?: number;
}

const ENCABEZADO_TABLA_ITEMS = [
  'Código',
  'Producto/Servicio',
  'Cantidad',
  'U. medida',
  'Precio Unit.',
  '% Bonif',
  'Subtotal',
  'Alícuota IVA',
  'Subtotal c/IVA',
].map((texto) => ({ text: texto, bold: true, fontSize: 7 }));

/** Tabla de ítems con las 9 columnas del formulario oficial. */
export function armarTablaItemsArca(filas: FilaItemArca[]) {
  return {
    table: {
      widths: [26, '*', 32, 32, 50, 32, 50, 40, 55],
      body: [
        ENCABEZADO_TABLA_ITEMS,
        ...(filas.length > 0
          ? filas.map((fila) => [
              { text: fila.codigo ?? '-', fontSize: 7 },
              { text: fila.descripcion, fontSize: 7 },
              { text: fila.cantidad !== undefined ? String(fila.cantidad) : '', fontSize: 7 },
              {
                text: fila.unidadMedida !== undefined ? formatearUnidad(fila.unidadMedida) : '',
                fontSize: 7,
              },
              {
                text: fila.precioUnitario !== undefined ? `$ ${formatearMoneda(fila.precioUnitario)}` : '',
                fontSize: 7,
              },
              {
                text: `${formatearMoneda(fila.bonifPorcentaje ?? 0)}%`,
                fontSize: 7,
              },
              {
                text: fila.subtotal !== undefined ? `$ ${formatearMoneda(fila.subtotal)}` : '',
                fontSize: 7,
              },
              {
                text: fila.ivaPorcentaje !== undefined ? `${fila.ivaPorcentaje}%` : '',
                fontSize: 7,
              },
              {
                text: fila.subtotalConIva !== undefined ? `$ ${formatearMoneda(fila.subtotalConIva)}` : '',
                fontSize: 7,
              },
            ])
          : [[{ text: '(sin ítems)', colSpan: 9, fontSize: 7 }, {}, {}, {}, {}, {}, {}, {}, {}]]),
      ],
    },
  };
}

export interface DesgloseAlicuotaArca {
  alicuotaPorcentaje: number;
  iva: number;
}

/** Bloque de totales abajo a la derecha. En Factura A discrimina el IVA por
 * alícuota (mostrando las que no se usaron en 0,00, como el formulario
 * oficial); en Factura B no se discrimina — el total ya incluye el IVA. */
export function armarTotalesArca(params: {
  esA: boolean;
  neto: number;
  desglose: DesgloseAlicuotaArca[];
  total: number;
}) {
  if (!params.esA) {
    return {
      alignment: 'right' as const,
      stack: [{ text: `Importe Total: $ ${formatearMoneda(params.total)}`, style: 'totalDestacado' as const }],
    };
  }

  const ivaPorAlicuota = new Map(params.desglose.map((d) => [d.alicuotaPorcentaje, d.iva]));

  return {
    alignment: 'right' as const,
    stack: [
      { text: `Importe Neto Gravado: $ ${formatearMoneda(params.neto)}` },
      ...ALICUOTAS_TOTALES_ORDEN.map((alicuota) => ({
        text: `IVA ${alicuota}%: $ ${formatearMoneda(ivaPorAlicuota.get(alicuota) ?? 0)}`,
      })),
      { text: `Importe Otros Tributos: $ ${formatearMoneda(0)}` },
      { text: `Importe Total: $ ${formatearMoneda(params.total)}`, style: 'totalDestacado' as const },
    ],
  };
}

/** Pie con el QR oficial (RG 4892), CAE y "Comprobante Autorizado". Solo para
 * comprobantes fiscales: el presupuesto no lleva nada de esto. */
export function armarPieAutorizadoArca(params: {
  qrDataUrl: string;
  cae: string;
  vencimientoCae: string;
}) {
  return {
    columns: [
      { image: params.qrDataUrl, width: 100 },
      {
        width: '*',
        stack: [
          { text: 'ARCA', style: 'arcaTexto' as const, alignment: 'right' as const },
          { text: `CAE N°: ${params.cae}`, alignment: 'right' as const },
          { text: `Fecha de Vto. de CAE: ${params.vencimientoCae}`, alignment: 'right' as const },
          {
            text: 'Comprobante Autorizado',
            style: 'autorizado' as const,
            alignment: 'right' as const,
          },
        ],
      },
    ],
    margin: [0, 15, 0, 0] as [number, number, number, number],
  };
}

/** Estilos compartidos por los dos providers (se combinan con los propios de cada uno). */
export const stylesArca = {
  tituloEmisor: { fontSize: 13, bold: true },
  tituloDocumento: { fontSize: 13, bold: true },
  letraRecuadro: { fontSize: 30, bold: true, alignment: 'center' as const },
  seccion: { fontSize: 10, bold: true, decoration: 'underline' as const },
  totalDestacado: { fontSize: 11, bold: true },
  autorizado: { bold: true },
  arcaTexto: { fontSize: 10, bold: true },
};
