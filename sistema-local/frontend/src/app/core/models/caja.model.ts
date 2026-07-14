export enum MedioPago {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA = 'TARJETA',
  OTRO = 'OTRO',
}

export const MEDIO_PAGO_OPCIONES: { valor: MedioPago; etiqueta: string }[] = [
  { valor: MedioPago.EFECTIVO, etiqueta: 'Efectivo' },
  { valor: MedioPago.TRANSFERENCIA, etiqueta: 'Transferencia' },
  { valor: MedioPago.TARJETA, etiqueta: 'Tarjeta' },
  { valor: MedioPago.OTRO, etiqueta: 'Otro' },
];

export interface MovimientoCaja {
  id: string;
  fecha: string;
  monto: number | string;
  descripcion?: string | null;
  medioPago: MedioPago;
  createdAt: string;
}

export type TotalesPorMedioPago = Record<MedioPago, number | string>;

export interface DiaCaja {
  fecha: string;
  movimientos: MovimientoCaja[];
  total: number;
  porMedioPago: TotalesPorMedioPago;
}

export interface NuevoMovimientoCaja {
  monto: number;
  descripcion?: string;
  medioPago?: MedioPago;
  /** Solo al agregar un movimiento a un cierre ya cerrado (edición desde Registros). */
  cierreId?: string;
}

export interface CierreCaja {
  id: string;
  fecha: string;
  montoTotal: number | string;
  montoEfectivo: number | string;
  montoTransferencia: number | string;
  montoTarjeta: number | string;
  montoOtro: number | string;
  createdAt: string;
}

export interface CierreConMovimientos {
  cierre: CierreCaja;
  movimientos: MovimientoCaja[];
}
