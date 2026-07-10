import { Emisor } from '../config/emisor';

/**
 * PORT (patrón puertos y adaptadores).
 *
 * El resto del sistema depende de ESTA interfaz, no de una librería concreta.
 * Hoy la implementa AfipSdkProvider (usando @afipsdk/afip.js), pero mañana podés
 * escribir otro adapter (facturajs, SOAP directo, etc.) sin tocar el service ni
 * el controller. Eso te sirve para el CV y para no quedar atado a un proveedor.
 */

/** Datos ya normalizados para pedir el CAE de un comprobante */
export interface DatosComprobante {
  /** Código de comprobante ARCA. Ej: 1=Factura A, 6=Factura B, 11=Factura C */
  tipoComprobante: number;
  /** Tipo de documento del receptor. 80=CUIT, 96=DNI, 99=Consumidor Final */
  docTipoReceptor: number;
  /** Nº de documento del receptor. 0 si es consumidor final sin identificar */
  docNroReceptor: number;
  fecha: Date;
  importeNeto: number;
  importeIva: number;
  importeTotal: number;
  /** Alícuota de IVA de ARCA. 5=21%, 4=10.5%, 6=27%, 3=0% */
  alicuotaIva: number;
}

export interface ResultadoCae {
  numeroComprobante: number;
  cae: string;
  vencimientoCae: string; // formato AAAAMMDD que devuelve ARCA
}

export interface ArcaProvider {
  /** Devuelve el número del último comprobante autorizado para ese punto de venta y tipo */
  ultimoComprobante(tipoComprobante: number): Promise<number>;

  /** Solicita el CAE a ARCA y devuelve el comprobante autorizado */
  solicitarCae(datos: DatosComprobante): Promise<ResultadoCae>;
}

/** Factory: dado un emisor, devuelve el provider configurado para ese emisor. */
export type ArcaProviderFactory = (emisor: Emisor) => ArcaProvider;
