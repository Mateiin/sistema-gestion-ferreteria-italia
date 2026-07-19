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

type Bordes = [boolean, boolean, boolean, boolean];
/** Un único divisor vertical (no dos): separa el bloque emisor (izquierda)
 * del bloque de datos del comprobante (derecha). Va en el borde DERECHO de
 * la columna de la letra únicamente — ni izquierdo ni caja alrededor de la
 * letra — y cierra abajo (para completar el recuadro general); arriba no
 * hace falta, ese tramo lo cubre "ORIGINAL" en la fila de encima. */
const UNICO_DIVISOR: Bordes = [false, false, true, true];
/** Celda vacía a la izquierda de "ORIGINAL": techo (arriba) + pared exterior
 * izquierda, para cerrar esa franja como una caja completa apoyada sobre el
 * encabezado — sin lado derecho propio (no hay divisor interno en esta
 * franja) ni abajo (ese borde lo comparte con el techo del encabezado de la
 * fila siguiente). */
const TECHO_IZQUIERDA: Bordes = [true, true, false, false];
/** Celda de "ORIGINAL": techo (arriba, cierra junto con las de los costados)
 * y piso (abajo, el mismo borde superior del encabezado) — SIN verticales
 * propias, para que la franja quede como una sola caja sin divisores
 * internos entre "ORIGINAL" y sus costados. */
const TECHO_Y_PISO: Bordes = [false, true, false, true];
/** Celda vacía a la derecha ("1/1"): techo + pared exterior derecha, misma
 * lógica que `TECHO_IZQUIERDA` pero del otro lado. */
const TECHO_DERECHA: Bordes = [false, true, true, false];

/** Ancho de la columna de la letra (A/B/C): angosta, ajustada a la letra +
 * "Cód. NN" — sin caja propia (ver `armarEncabezadoArca`), solo el ancho
 * necesario para centrar el texto sobre la línea divisoria. Un poco más ancha
 * que el mínimo para la letra sola porque también aloja "ORIGINAL" arriba. */
const ANCHO_COLUMNA_LETRA = 62;
/** Ancho de la columna de datos del comprobante (derecha), suficientemente
 * ancha para "Fecha de Inicio de Actividades: DD/MM/AAAA" en una línea. */
const ANCHO_COLUMNA_DATOS = 200;

/** Tope de ancho/alto del logo del emisor en el encabezado, vía `fit` de
 * pdfmake (escala manteniendo proporción DENTRO de esta caja — a diferencia
 * de solo fijar `width`, esto también acota la altura si el logo es
 * apaisado/vertical, para que uno muy alto no empuje "Razón Social"/
 * "Domicilio" de más). El ancho es prácticamente el ancho ÚTIL completo de
 * la columna del emisor (página A4 = 595.28pt − 60pt de márgenes − 62pt de
 * la columna de la letra − 200pt de la de datos = 273.28pt de columna, menos
 * el margen [3,4,3,3] de la celda ≈ 267pt; se deja 260 con un pequeño
 * colchón) — pedido explícito: que el logo llene ese ancho en vez de quedar
 * angosto con aire en blanco al lado. El alto (90) es generoso a propósito
 * para que el ANCHO sea casi siempre el lado que termina limitando el
 * tamaño (`fit` usa el más restrictivo de los dos); si algún logo viene muy
 * apaisado y el ancho de 260 ya lo deja bajo, no hay problema, pero uno muy
 * cuadrado/vertical no va a estirarse más allá de 90 de alto. */
const ANCHO_MAXIMO_LOGO_EMISOR = 240;
const ALTO_MAXIMO_LOGO_EMISOR = 90;

/** Línea "Etiqueta: valor" del encabezado (emisor o comprobante): la
 * etiqueta (lo que va antes de los dos puntos) siempre en negrita; el valor
 * en negrita solo si `negritaValor` (Punto de Venta/Comp. Nro/Fecha de
 * Emisión, que el molde pide resaltar completos — a diferencia de
 * CUIT/Ingresos Brutos/Fecha de Inicio de Actividades, donde solo el título
 * va en negrita). Fuente chica + margen inferior propio para que las líneas
 * respiren, en vez de quedar apretadas unas contra otras. */
function lineaEncabezado(etiqueta: string, valor: string, margenInferior = 2, negritaValor = false) {
  return {
    text: [
      { text: `${etiqueta} `, bold: true },
      { text: valor, bold: negritaValor },
    ],
    style: 'lineaEncabezado' as const,
    margin: [0, 0, 0, margenInferior] as [number, number, number, number],
  };
}

/**
 * Encabezado completo en UNA sola `table` de pdfmake: es la única forma de
 * que el borde inferior de "ORIGINAL" sea el MISMO borde superior del
 * recuadro emisor/letra/datos (fila 0 = "ORIGINAL"/"1/1", fila 1 =
 * emisor/letra/datos), y de que las líneas verticales de la franja "ORIGINAL"
 * arranquen alineadas con las del recuadro de abajo — misma columna, mismo
 * ancho, sin cortes. La franja "ORIGINAL"/"1/1" es una caja limpia SIN
 * divisores internos (`TECHO_Y_PISO`: solo techo/piso propios, nada de
 * verticales) — ni "ORIGINAL" ni las celdas vacías de los costados tienen
 * borde lateral entre sí. La columna de la letra NO tiene caja propia: un
 * ÚNICO divisor vertical (`UNICO_DIVISOR`, solo el lado derecho) la separa de
 * emisor/datos, corrido de punta a punta de la fila — nada de cuadrado
 * alrededor de la letra, solo esa línea y la letra flotando centrada encima.
 */
export function armarEncabezadoArca(datos: EncabezadoArcaDatos) {
  const bloqueEmisor = datos.emisor.logoDataUrl
    ? {
        image: datos.emisor.logoDataUrl,
        fit: [ANCHO_MAXIMO_LOGO_EMISOR, ALTO_MAXIMO_LOGO_EMISOR] as [number, number],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      }
    : {
        text: datos.emisor.razonSocial,
        style: 'tituloEmisor' as const,
        margin: [0, 0, 0, 3] as [number, number, number, number],
      };

  const stackEmisor = [
    bloqueEmisor,
    lineaEncabezado('Razón Social:', datos.emisor.razonSocial),
    lineaEncabezado('Domicilio Comercial:', datos.emisor.domicilioComercial ?? '-'),
    lineaEncabezado(
      'Condición frente al IVA:',
      CONDICION_IVA_EMISOR_LEGIBLE[datos.emisor.condicionIva] ?? datos.emisor.condicionIva,
    ),
  ];

  // Orden pedido: Punto de Venta + Comp./Ficha Nro en el mismo renglón: fecha
  // de emisión con un espacio leve; CUIT con un espacio doble (más separado,
  // es el dato más importante de esta columna); Ingresos Brutos e Inicio de
  // Actividades pegados a CUIT y entre sí (son datos secundarios). Punto de
  // Venta/Comp. Nro/Fecha de Emisión van con etiqueta Y VALOR en negrita;
  // CUIT/Ingresos Brutos/Fecha de Inicio de Actividades solo la etiqueta.
  const stackDatos = [
    {
      text: datos.tituloDocumento,
      style: 'tituloDocumento' as const,
      margin: [0, 0, 0, 3] as [number, number, number, number],
    },
    lineaEncabezado(
      `Punto de Venta: ${String(datos.puntoVenta).padStart(4, '0')}   ${datos.etiquetaNumero}:`,
      String(datos.numeroComprobante),
      3,
      true,
    ),
    lineaEncabezado('Fecha de Emisión:', datos.fechaEmision, 6, true),
    lineaEncabezado('CUIT:', String(datos.emisor.cuit), 1),
    lineaEncabezado('Ingresos Brutos:', datos.emisor.ingresosBrutos ?? '-', 1),
    lineaEncabezado('Fecha de Inicio de Actividades:', datos.emisor.inicioActividades ?? '-', 0),
  ];

  return {
    table: {
      widths: ['*', ANCHO_COLUMNA_LETRA, ANCHO_COLUMNA_DATOS],
      body: [
        [
          { text: '', border: TECHO_IZQUIERDA },
          {
            text: 'ORIGINAL',
            alignment: 'center' as const,
            bold: true,
            fontSize: 10,
            margin: [0, 3, 0, 3] as [number, number, number, number],
            border: TECHO_Y_PISO,
          },
          { text: '', border: TECHO_DERECHA },
        ],
        [
          { stack: stackEmisor, margin: [3, 4, 3, 3] as [number, number, number, number] },
          {
            stack: [
              { text: datos.letra, style: 'letraRecuadro' as const },
              datos.codigo
                ? { text: `Cód. ${datos.codigo}`, alignment: 'center' as const, fontSize: 8, bold: true }
                : null,
            ].filter((item) => item !== null),
            margin: [0, 4, 0, 0] as [number, number, number, number],
            border: UNICO_DIVISOR,
          },
          { stack: stackDatos, margin: [3, 4, 3, 3] as [number, number, number, number] },
        ],
      ],
    },
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

/** Ancho fijo y angosto de la columna izquierda en el renglón CUIT/Razón
 * Social: el documento siempre es corto ("CUIT: 20111222339",
 * "Consumidor Final"), así que achicarlo le deja mucho más lugar a la razón
 * social — que puede ser un nombre largo — para entrar completa sin envolver
 * antes de tiempo. */
const ANCHO_DOCUMENTO_RECEPTOR = 130;

/** Resalta en negrita lo que esté antes de "': '" (la etiqueta, p. ej. "CUIT:"
 * o "Domicilio Comercial:"); si no hay separador (p. ej. "Consumidor Final",
 * que no tiene etiqueta), lo deja como texto plano. */
function etiquetaNegrita(texto: string) {
  const fin = texto.indexOf(': ');
  if (fin === -1) return { text: texto };
  return {
    text: [
      { text: texto.slice(0, fin + 2), bold: true },
      { text: texto.slice(fin + 2) },
    ],
  };
}

/** Un renglón de a dos datos del receptor, lado a lado con espacio entre
 * ambos (igual que el molde oficial: CUIT+Razón Social, IVA+Domicilio), con
 * la etiqueta de cada uno en negrita (ver `etiquetaNegrita`). `anchoIzquierda`
 * angosta la primera columna cuando el segundo dato necesita más lugar (ver
 * `ANCHO_DOCUMENTO_RECEPTOR`); por defecto van 50/50. */
function filaDobleReceptor(izquierda: string, derecha: string, anchoIzquierda: number | '*' = '*') {
  return {
    columns: [
      { ...etiquetaNegrita(izquierda), width: anchoIzquierda },
      { ...etiquetaNegrita(derecha), width: '*' },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 4] as [number, number, number, number],
  };
}

/** Franja de datos del receptor, en un recuadro debajo del encabezado, en
 * renglones de a dos: CUIT + Razón Social; Condición de IVA + Domicilio;
 * Condición de venta sola (no tiene par, con el mismo espacio arriba que
 * separa a los otros dos renglones entre sí). */
export function armarReceptorArca(datos: ReceptorArcaDatos) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              filaDobleReceptor(
                datos.documento,
                `Apellido y Nombre / Razón Social: ${datos.razonSocial ?? '-'}`,
                ANCHO_DOCUMENTO_RECEPTOR,
              ),
              filaDobleReceptor(
                `Condición frente al IVA: ${datos.condicionIva ?? '-'}`,
                `Domicilio Comercial: ${datos.domicilio ?? '-'}`,
              ),
              { text: `Condición de venta: ${datos.condicionVenta ?? '-'}`, bold: true },
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

/** Todos los encabezados de columna centrados, EXCEPTO "Producto/Servicio":
 * esa va alineada a la izquierda en horizontal (los nombres de producto son
 * variables y largos, centrarla se lee peor) pero centrada en vertical, para
 * que quede a la misma altura que encabezados vecinos que envuelven en 2
 * líneas (p. ej. "U. medida"). */
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
].map((texto) => ({
  text: texto,
  bold: true,
  fontSize: 7,
  alignment: (texto === 'Producto/Servicio' ? 'left' : 'center') as 'left' | 'center',
  verticalAlignment: 'middle' as const,
}));

/** Tabla de ítems con las 9 columnas del formulario oficial. Los anchos fijos
 * se ajustaron angostos para dejarle más aire a "Producto/Servicio" (columna
 * flexible '*'), que es la que necesita espacio para nombres largos. */
export function armarTablaItemsArca(filas: FilaItemArca[]) {
  return {
    table: {
      widths: [32, '*', 30, 30, 46, 28, 46, 36, 48],
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

interface FilaTotalArca {
  etiqueta: string;
  monto: string;
  destacado?: boolean;
}

/** Layout sin líneas para la sub-tabla de 3 columnas de los totales (ver
 * `envolverTotalesEnRecuadro`): el único fin de esa sub-tabla es la
 * ALINEACIÓN (etiqueta/"$"/monto en columnas fijas), no dibuja bordes
 * propios — el recuadro visible es el de la tabla exterior. El padding
 * vertical (mayor al default) es el "espacio entre líneas" pedido. */
const LAYOUT_FILAS_TOTALES = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: (i: number) => (i === 0 ? 0 : 4),
  paddingRight: () => 0,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
};

/** Todas las líneas de totales van en negrita (pedido del molde); "Importe
 * Total" además usa `totalDestacado` (fontSize más grande) para distinguirse
 * del resto, que ya viene en negrita por `defaultStyle`/`bold` acá. */
function celdaTotal(texto: string, alineacion: 'left' | 'right', destacado?: boolean) {
  return destacado
    ? { text: texto, alignment: alineacion, style: 'totalDestacado' as const }
    : { text: texto, alignment: alineacion, bold: true };
}

/** Encierra los totales en un recuadro con borde, del MISMO ancho que el
 * encabezado y el receptor (ancho completo del área útil). Adentro, una
 * sub-tabla de 3 columnas SIN bordes (etiqueta a la derecha / "$" / monto a
 * la derecha) para que el "$" quede siempre en la misma posición vertical sin
 * importar el largo de la etiqueta, y el monto quede lejos del "$" (columna
 * ancha de sobra) — igual que el molde oficial. */
function envolverTotalesEnRecuadro(filas: FilaTotalArca[]) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            table: {
              widths: ['*', 12, 110],
              body: filas.map((fila) => [
                celdaTotal(fila.etiqueta, 'right', fila.destacado),
                celdaTotal('$', 'left', fila.destacado),
                celdaTotal(fila.monto, 'right', fila.destacado),
              ]),
            },
            layout: LAYOUT_FILAS_TOTALES,
            margin: [6, 6, 6, 6] as [number, number, number, number],
          },
        ],
      ],
    },
  };
}

/** Bloque de totales, en un recuadro alineado a la derecha. En Factura A
 * discrimina el IVA por alícuota (mostrando las que no se usaron en 0,00,
 * como el formulario oficial); en Factura B no se discrimina — el total ya
 * incluye el IVA. */
export function armarTotalesArca(params: {
  esA: boolean;
  neto: number;
  desglose: DesgloseAlicuotaArca[];
  total: number;
}) {
  if (!params.esA) {
    return envolverTotalesEnRecuadro([
      { etiqueta: 'Importe Total:', monto: formatearMoneda(params.total), destacado: true },
    ]);
  }

  const ivaPorAlicuota = new Map(params.desglose.map((d) => [d.alicuotaPorcentaje, d.iva]));

  return envolverTotalesEnRecuadro([
    { etiqueta: 'Importe Neto Gravado:', monto: formatearMoneda(params.neto) },
    ...ALICUOTAS_TOTALES_ORDEN.map((alicuota) => ({
      etiqueta: `IVA ${alicuota}%:`,
      monto: formatearMoneda(ivaPorAlicuota.get(alicuota) ?? 0),
    })),
    { etiqueta: 'Importe Otros Tributos:', monto: formatearMoneda(0) },
    { etiqueta: 'Importe Total:', monto: formatearMoneda(params.total), destacado: true },
  ]);
}

/** Ancho de la columna del QR (fijo, igual al `width` de la imagen). */
const ANCHO_QR = 80;
/** Ancho de la columna del logo/texto ARCA + leyendas, fijo para que la
 * leyenda legal envuelva en 2-3 líneas en vez de estirarse de más. */
const ANCHO_ARCA = 160;

/** Pie con el QR oficial (RG 4892) en 3 columnas: QR solo (sin nada debajo),
 * logo de ARCA con "Comprobante Autorizado" y la leyenda legal DEBAJO DEL
 * LOGO (no del QR — son cosas separadas en el molde oficial), y a la derecha
 * CAE + vencimiento con la etiqueta en negrita y el valor en texto normal. El
 * "Pág. X/N" centrado entre las columnas va aparte (lo arma el provider, que
 * es quien conoce `currentPage`/`pageCount` del `footer` de pdfmake). Solo
 * para comprobantes fiscales: el presupuesto no lleva nada de esto. */
export function armarPieAutorizadoArca(params: {
  qrDataUrl: string;
  cae: string;
  vencimientoCae: string;
  /** dataURL del logo oficial de ARCA. TODO: no hay archivo de logo
   * disponible todavía — mientras tanto se cae al texto "ARCA" en negrita.
   * Cuando se consiga el archivo (.png/.jpg), resolverlo a dataURL igual que
   * `cargarLogoDataUrl` hace con `EMISOR_LOGO_PATH` (ver `config/emisor.ts`)
   * y pasarlo acá. */
  arcaLogoDataUrl?: string;
}) {
  const bloqueArca = params.arcaLogoDataUrl
    ? { image: params.arcaLogoDataUrl, width: 70 }
    : { text: 'ARCA', style: 'arcaTexto' as const };

  return {
    columns: [
      { width: ANCHO_QR, image: params.qrDataUrl },
      {
        width: ANCHO_ARCA,
        stack: [
          bloqueArca,
          {
            text: 'Comprobante Autorizado',
            style: 'autorizado' as const,
            margin: [0, 4, 0, 2] as [number, number, number, number],
          },
          {
            text: 'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación',
            fontSize: 6.5,
          },
        ],
      },
      {
        width: '*',
        stack: [
          {
            text: [{ text: 'CAE N°: ', bold: true }, { text: params.cae }],
            alignment: 'right' as const,
          },
          {
            text: [{ text: 'Fecha de Vto. de CAE: ', bold: true }, { text: params.vencimientoCae }],
            alignment: 'right' as const,
            margin: [0, 2, 0, 0] as [number, number, number, number],
          },
        ],
      },
    ],
    columnGap: 10,
    margin: [0, 4, 0, 0] as [number, number, number, number],
  };
}

/** Estilos compartidos por los dos providers (se combinan con los propios de cada uno). */
export const stylesArca = {
  tituloEmisor: { fontSize: 11, bold: true },
  tituloDocumento: { fontSize: 11, bold: true },
  /** Líneas de detalle del encabezado (emisor y datos del comprobante): chicas
   * y con algo de interlineado para que se lean ordenadas, no amontonadas. */
  lineaEncabezado: { fontSize: 8, lineHeight: 1.2 },
  letraRecuadro: { fontSize: 24, bold: true, alignment: 'center' as const },
  seccion: { fontSize: 10, bold: true, decoration: 'underline' as const },
  totalDestacado: { fontSize: 11, bold: true },
  autorizado: { bold: true },
  arcaTexto: { fontSize: 10, bold: true },
};
