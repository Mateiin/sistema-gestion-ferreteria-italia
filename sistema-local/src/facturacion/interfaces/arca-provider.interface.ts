import { Emisor } from '../config/emisor';

/**
 * PORT (patrón puertos y adaptadores).
 *
 * Expresa la INTENCIÓN DE DOMINIO: "emití un comprobante con estos ítems para
 * este receptor". No sabe nada de la librería concreta ni de cómo se calcula el
 * IVA: de eso se ocupa el adapter / el SDK. El service y el controller dependen
 * de esta interfaz, así que cambiar de librería es escribir otro adapter.
 */

export type TipoFacturaDominio = 'A' | 'B';

export interface ItemComprobante {
  /** Importe neto de la línea (cantidad * precio unitario, SIN IVA) */
  neto: number;
  /** Alícuota de IVA en porcentaje: 21, 10.5, 27, 0. Default de negocio: 21 */
  ivaPorcentaje: number;
}

export type CondicionIvaReceptor =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTO'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL';

export interface DatosComprobante {
  tipoFactura: TipoFacturaDominio;
  /** 80=CUIT, 96=DNI, 99=Consumidor Final */
  docTipoReceptor: number;
  docNroReceptor: number;
  /** Requerido para Factura A (condición de IVA del receptor) */
  condicionIvaReceptor?: CondicionIvaReceptor;
  items: ItemComprobante[];
}

export interface ResultadoCae {
  numeroComprobante: number;
  cae: string;
  vencimientoCae: string;
  /** Totales tal como los autorizó ARCA (fuente de verdad para persistir) */
  importeNeto: number;
  importeIva: number;
  importeTotal: number;
}

export interface ArcaProvider {
  ultimoComprobante(tipoFactura: TipoFacturaDominio): Promise<number>;
  solicitarCae(datos: DatosComprobante): Promise<ResultadoCae>;
}

/** Factory: dado un emisor, devuelve el provider configurado para ese emisor. */
export type ArcaProviderFactory = (emisor: Emisor) => ArcaProvider;
