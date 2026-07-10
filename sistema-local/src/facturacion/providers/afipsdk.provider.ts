import Afip from '@afipsdk/afip.js';
import { Emisor } from '../config/emisor';
import {
  ArcaProvider,
  DatosComprobante,
  ResultadoCae,
} from '../interfaces/arca-provider.interface';

/**
 * ADAPTER usando @afipsdk/afip.js.
 *
 * Ventaja: maneja WSAA (autenticación) y el cacheo del Ticket de Acceso por vos,
 * y tiene modo desarrollo para probar sin certificado. Ideal para llegar rápido
 * a la primera factura en homologación.
 *
 * A tener en cuenta si algún día vendés el sistema: afip.js enruta a través de
 * los servidores de AfipSDK y usa un access_token de ellos. Para un producto
 * conviene evaluar un adapter self-contained (facturajs / SOAP directo). Como el
 * resto del código depende del PORT y no de esta clase, ese cambio es aislado.
 */
export class AfipSdkProvider implements ArcaProvider {
  private readonly afip: Afip;
  private readonly puntoVenta: number;

  constructor(private readonly emisor: Emisor) {
    this.puntoVenta = emisor.puntoVenta;
    this.afip = new Afip({
      CUIT: emisor.cuit,
      cert: emisor.cert,
      key: emisor.key,
      production: emisor.ambiente === 'produccion',
      // access_token: process.env.AFIPSDK_TOKEN, // requerido en producción con afipsdk
    });
  }

  async ultimoComprobante(tipoComprobante: number): Promise<number> {
    const ultimo = await this.afip.ElectronicBilling.getLastVoucher(
      this.puntoVenta,
      tipoComprobante,
    );
    return Number(ultimo) || 0;
  }

  async solicitarCae(datos: DatosComprobante): Promise<ResultadoCae> {
    const numero = (await this.ultimoComprobante(datos.tipoComprobante)) + 1;
    const fecha = this.formatearFecha(datos.fecha);

    const payload: Record<string, unknown> = {
      CantReg: 1,
      PtoVta: this.puntoVenta,
      CbteTipo: datos.tipoComprobante,
      Concepto: 1, // 1 = Productos (una ferretería vende productos)
      DocTipo: datos.docTipoReceptor,
      DocNro: datos.docNroReceptor,
      CbteDesde: numero,
      CbteHasta: numero,
      CbteFch: fecha,
      ImpTotal: datos.importeTotal,
      ImpTotConc: 0, // neto no gravado
      ImpNeto: datos.importeNeto,
      ImpOpEx: 0, // exento
      ImpIVA: datos.importeIva,
      ImpTrib: 0, // otros tributos
      MonId: 'PES',
      MonCotiz: 1,
      Iva: [
        {
          Id: datos.alicuotaIva,
          BaseImp: datos.importeNeto,
          Importe: datos.importeIva,
        },
      ],
    };

    const respuesta = await this.afip.ElectronicBilling.createVoucher(payload);

    return {
      numeroComprobante: numero,
      cae: respuesta.CAE,
      vencimientoCae: respuesta.CAEFchVto,
    };
  }

  /** ARCA espera la fecha como string AAAAMMDD */
  private formatearFecha(fecha: Date): string {
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
}

/** Factory que el módulo registra como ArcaProviderFactory */
export const crearAfipSdkProvider = (emisor: Emisor): ArcaProvider =>
  new AfipSdkProvider(emisor);
