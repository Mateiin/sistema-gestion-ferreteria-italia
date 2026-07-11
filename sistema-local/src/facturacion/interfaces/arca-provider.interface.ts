import { Emisor } from '../config/emisor';

/**
 * PORT (patrón puertos y adaptadores).
 *
 * Expresa la INTENCIÓN DE DOMINIO: "emití este comprobante, ya calculado, para
 * este receptor". El cálculo (agrupar por alícuota, totalizar) es responsabilidad
 * del dominio (`Comprobante`, en `entities/comprobante.entity.ts`), no del
 * adapter: el adapter solo traduce esta forma a la que espera el SDK. El Gestor
 * y el controller dependen de esta interfaz, así que cambiar de librería es
 * escribir otro adapter.
 */

export type TipoFacturaDominio = 'A' | 'B';

export type CondicionIvaReceptor =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTO'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL';

/** Importes ya agrupados por alícuota (lo calcula `Comprobante.calcularDesglose`) */
export interface AlicuotaDesglose {
  alicuotaPorcentaje: number;
  neto: number;
  iva: number;
}

export interface DatosComprobante {
  tipoFactura: TipoFacturaDominio;
  /** 80=CUIT, 96=DNI, 99=Consumidor Final */
  docTipoReceptor: number;
  docNroReceptor: number;
  /** Requerido para Factura A (condición de IVA del receptor) */
  condicionIvaReceptor?: CondicionIvaReceptor;
  ivaDesglose: AlicuotaDesglose[];
  importeNeto: number;
  importeIva: number;
  importeTotal: number;
}

/** Comprobante ya emitido al que hace referencia una Nota de Crédito */
export interface ComprobanteAsociado {
  /** Código ARCA del comprobante original: 1=Factura A, 6=Factura B */
  tipoComprobante: number;
  puntoVenta: number;
  numero: number;
}

export interface DatosNotaCredito extends DatosComprobante {
  comprobanteAsociado: ComprobanteAsociado;
}

export interface ResultadoCae {
  numeroComprobante: number;
  cae: string;
  vencimientoCae: string;
  /** Fecha de emisión enviada a ARCA (CbteFch), formato AAAAMMDD */
  fecha: string;
}

export interface ArcaProvider {
  ultimoComprobante(tipoFactura: TipoFacturaDominio): Promise<number>;
  solicitarCae(datos: DatosComprobante): Promise<ResultadoCae>;
  solicitarNotaCredito(datos: DatosNotaCredito): Promise<ResultadoCae>;
}

/** Factory: dado un emisor, devuelve el provider configurado para ese emisor. */
export type ArcaProviderFactory = (emisor: Emisor) => ArcaProvider;
