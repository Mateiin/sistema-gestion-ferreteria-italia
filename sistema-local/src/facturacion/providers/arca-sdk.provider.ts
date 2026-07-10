import { Arca } from '@arcasdk/core';
import { Emisor } from '../config/emisor';
import {
  ArcaProvider,
  CondicionIvaReceptor,
  DatosComprobante,
  ResultadoCae,
  TipoFacturaDominio,
} from '../interfaces/arca-provider.interface';

/**
 * ADAPTER usando @arcasdk/core.
 *
 * Habla DIRECTO con los web services oficiales de ARCA (WSAA + WSFEv1): sin
 * intermediarios, sin token de terceros. El SDK maneja la autenticación, el
 * cacheo del Ticket de Acceso y el armado del SOAP; acá solo traducimos entre
 * el dominio (ArcaProvider) y la forma que espera WSFEv1 (IVoucher).
 *
 * Toda la traducción entre el dominio y la librería vive acá. Si algún día
 * cambiás de SDK, reescribís SOLO este archivo.
 */

const CBTE_TIPO: Record<TipoFacturaDominio, number> = {
  A: 1,
  B: 6,
};

/**
 * Códigos oficiales de "Condición frente al IVA del receptor" (RG 5616/2024,
 * FEParamGetCondicionIvaReceptor). No vienen tipados en el SDK porque ARCA los
 * expone como catálogo dinámico; estos son los valores estables para A y B.
 */
const CONDICION_IVA_RECEPTOR: Record<CondicionIvaReceptor, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
};

/** Alícuota de IVA (Iva.Id de WSFEv1). 5=21%, 4=10.5%, 6=27%, 3=0% */
const ALICUOTA_IVA: Record<number, number> = {
  21: 5,
  10.5: 4,
  27: 6,
  0: 3,
};

function mapAlicuota(porcentaje: number): number {
  const id = ALICUOTA_IVA[porcentaje];
  if (!id) throw new Error(`Alícuota de IVA no soportada: ${porcentaje}%`);
  return id;
}

export class ArcaSdkProvider implements ArcaProvider {
  private readonly arca: Arca;
  private readonly puntoVenta: number;

  constructor(private readonly emisor: Emisor) {
    this.puntoVenta = emisor.puntoVenta;
    this.arca = new Arca({
      cuit: emisor.cuit,
      cert: emisor.cert,
      key: emisor.key,
      production: emisor.ambiente === 'produccion',
    });
  }

  async ultimoComprobante(tipoFactura: TipoFacturaDominio): Promise<number> {
    const resultado = await this.arca.electronicBillingService.getLastVoucher(
      this.puntoVenta,
      CBTE_TIPO[tipoFactura],
    );
    return resultado.cbteNro ?? 0;
  }

  async solicitarCae(datos: DatosComprobante): Promise<ResultadoCae> {
    // ARCA pide el IVA discriminado por alícuota (no por línea de venta), así
    // que agrupamos los ítems por alícuota antes de armar el comprobante.
    const porAlicuota = new Map<number, { neto: number; iva: number }>();
    for (const item of datos.items) {
      const acumulado = porAlicuota.get(item.ivaPorcentaje) ?? {
        neto: 0,
        iva: 0,
      };
      acumulado.neto = this.redondear(acumulado.neto + item.neto);
      acumulado.iva = this.redondear(
        acumulado.iva + item.neto * (item.ivaPorcentaje / 100),
      );
      porAlicuota.set(item.ivaPorcentaje, acumulado);
    }

    const importeNeto = this.redondear(
      [...porAlicuota.values()].reduce((acc, v) => acc + v.neto, 0),
    );
    const importeIva = this.redondear(
      [...porAlicuota.values()].reduce((acc, v) => acc + v.iva, 0),
    );
    const importeTotal = this.redondear(importeNeto + importeIva);

    const condicionIva =
      CONDICION_IVA_RECEPTOR[
        datos.condicionIvaReceptor ?? 'CONSUMIDOR_FINAL'
      ];

    const resultado = await this.arca.electronicBillingService.createNextVoucher({
      CantReg: 1,
      PtoVta: this.puntoVenta,
      CbteTipo: CBTE_TIPO[datos.tipoFactura],
      Concepto: 1, // 1 = Productos (una ferretería vende productos)
      DocTipo: datos.docTipoReceptor,
      DocNro: datos.docNroReceptor,
      CbteFch: this.formatearFecha(new Date()),
      ImpTotal: importeTotal,
      ImpTotConc: 0,
      ImpNeto: importeNeto,
      ImpOpEx: 0,
      ImpIVA: importeIva,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      CondicionIVAReceptorId: condicionIva,
      Iva: [...porAlicuota.entries()].map(([porcentaje, v]) => ({
        Id: mapAlicuota(porcentaje),
        BaseImp: v.neto,
        Importe: v.iva,
      })),
    });

    const detalle = resultado.response.FeDetResp?.FECAEDetResponse?.[0];

    if (!resultado.cae) {
      const observaciones = detalle?.Observaciones?.Obs?.map(
        (o) => `${o.Code}: ${o.Msg}`,
      ).join('; ');
      const erroresGlobales = resultado.response.Errors?.Err?.map(
        (e) => `${e.Code}: ${e.Msg}`,
      ).join('; ');
      throw new Error(
        `ARCA no aprobó el comprobante${observaciones ? ` — ${observaciones}` : ''}${erroresGlobales ? ` — ${erroresGlobales}` : ''}`,
      );
    }

    return {
      numeroComprobante: detalle!.CbteDesde!,
      cae: resultado.cae,
      vencimientoCae: resultado.caeFchVto,
      importeNeto,
      importeIva,
      importeTotal,
    };
  }

  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** ARCA espera la fecha como string AAAAMMDD */
  private formatearFecha(fecha: Date): string {
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
}

export const crearArcaSdkProvider = (emisor: Emisor): ArcaProvider =>
  new ArcaSdkProvider(emisor);
