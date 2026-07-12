import { Cliente } from './cliente.model';

export enum EstadoVenta {
  ABIERTA = 'ABIERTA',
  EMITIDA = 'EMITIDA',
  ANULADA = 'ANULADA',
}

/** Código ARCA de unidad de medida. Subconjunto de uso común en una ferretería. */
export const UNIDAD_MEDIDA_OPCIONES = [
  { valor: 7, etiqueta: 'unidades' },
  { valor: 1, etiqueta: 'kg' },
  { valor: 2, etiqueta: 'm' },
  { valor: 3, etiqueta: 'm³' },
  { valor: 4, etiqueta: 'l' },
  { valor: 5, etiqueta: 'km' },
  { valor: 9, etiqueta: 'docena' },
  { valor: 41, etiqueta: 'm²' },
];

export const IVA_PORCENTAJE_OPCIONES = [21, 10.5];

export interface LineaVenta {
  id: string;
  ventaId: string;
  descripcion: string;
  cantidad: number | string;
  precioUnitario: number | string;
  ivaPorcentaje: number | string;
  unidadMedida: number;
  createdAt: string;
}

export interface NuevaLineaVenta {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  ivaPorcentaje?: number;
  unidadMedida?: number;
}

/** Respuesta de los endpoints de /ventas: la Venta + su total ya calculado. */
export interface Venta {
  id: string;
  clienteId: string;
  cliente: Cliente;
  estado: EstadoVenta;
  comprobanteId?: string | null;
  lineas: LineaVenta[];
  createdAt: string;
  updatedAt: string;
  total: number;
}
