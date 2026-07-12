/** Mismos 7 valores que usa el facturador de ARCA. La ficha solo permite
 * CONTADO o CUENTA_CORRIENTE al facturar (ver FacturarFichaDto en el backend). */
export enum CondicionVenta {
  CONTADO = 'CONTADO',
  TARJETA_DEBITO = 'TARJETA_DEBITO',
  TARJETA_CREDITO = 'TARJETA_CREDITO',
  CUENTA_CORRIENTE = 'CUENTA_CORRIENTE',
  CHEQUE = 'CHEQUE',
  TRANSFERENCIA_BANCARIA = 'TRANSFERENCIA_BANCARIA',
  OTRA = 'OTRA',
}

export const CONDICION_VENTA_FICHA_OPCIONES = [
  { valor: CondicionVenta.CONTADO, etiqueta: 'Contado' },
  { valor: CondicionVenta.CUENTA_CORRIENTE, etiqueta: 'Cuenta corriente' },
];

/** Letra impresa según el código ARCA (mismo mapeo que `Comprobante.letra()` en el backend) */
const LETRA_POR_CODIGO: Record<number, string> = {
  1: 'A',
  3: 'A',
  6: 'B',
  8: 'B',
  11: 'C',
};

export function letraComprobante(tipoComprobante: number): string {
  return LETRA_POR_CODIGO[tipoComprobante] ?? '?';
}

export interface Comprobante {
  id: string;
  emisorId: string;
  tipoComprobante: number;
  puntoVenta: number;
  numero: number;
  docTipoReceptor: number;
  docNroReceptor: number | string;
  razonSocialReceptor?: string | null;
  domicilioReceptor?: string | null;
  condicionIvaReceptor?: string | null;
  condicionVenta?: CondicionVenta | null;
  importeNeto: number | string;
  importeIva: number | string;
  importeTotal: number | string;
  cae: string;
  vencimientoCae: string;
  ventaId?: string | null;
  comprobanteOriginalId?: string | null;
  estado: string;
  emitidoEl: string;
}
