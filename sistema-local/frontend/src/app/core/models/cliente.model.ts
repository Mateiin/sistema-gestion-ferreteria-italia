/** Mismos valores que `CondicionIvaCliente` del backend (ventas/modelo/cliente.entity.ts) */
export enum CondicionIvaCliente {
  RESPONSABLE_INSCRIPTO = 'RESPONSABLE_INSCRIPTO',
  MONOTRIBUTO = 'MONOTRIBUTO',
  EXENTO = 'EXENTO',
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
}

export const CONDICION_IVA_LEGIBLE: Record<CondicionIvaCliente, string> = {
  [CondicionIvaCliente.RESPONSABLE_INSCRIPTO]: 'Responsable Inscripto',
  [CondicionIvaCliente.MONOTRIBUTO]: 'Monotributista',
  [CondicionIvaCliente.EXENTO]: 'Exento',
  [CondicionIvaCliente.CONSUMIDOR_FINAL]: 'Consumidor Final',
};

/** 80=CUIT, 96=DNI, 99=Consumidor Final (mismos códigos que usa ARCA) */
export const DOC_TIPO_OPCIONES = [
  { valor: 80, etiqueta: 'CUIT' },
  { valor: 96, etiqueta: 'DNI' },
  { valor: 99, etiqueta: 'Consumidor Final (sin identificar)' },
];

export interface Cliente {
  id: string;
  razonSocial: string;
  docTipo: number;
  /** El backend serializa bigint como string */
  docNro: number | string;
  condicionIva: CondicionIvaCliente;
  domicilio?: string | null;
  email?: string | null;
  telefono?: string | null;
  activo: boolean;
}

export type ClienteFormValue = Omit<Cliente, 'id' | 'activo'>;

/** Espejo de `Cliente.tipoFacturaCorrespondiente()` del backend: el emisor es
 * RI, así que el tipo de factura depende solo de la condición de IVA del cliente. */
export function tipoFacturaDeCliente(cliente: Pick<Cliente, 'condicionIva'>): 'A' | 'B' {
  return cliente.condicionIva === CondicionIvaCliente.RESPONSABLE_INSCRIPTO ? 'A' : 'B';
}
