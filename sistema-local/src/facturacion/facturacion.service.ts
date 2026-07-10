import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comprobante } from './entities/comprobante.entity';
import { CrearFacturaDto, TipoFactura } from './dto/crear-factura.dto';
import { Emisor } from './config/emisor';
import {
  ArcaProviderFactory,
  DatosComprobante,
} from './interfaces/arca-provider.interface';

/** Alícuota general de IVA en Argentina: 21% -> Id 5 en ARCA */
const ALICUOTA_IVA_21 = 5;
const IVA_21 = 0.21;

/** Mapeo de nuestro enum a los códigos de comprobante de ARCA */
const CODIGO_COMPROBANTE: Record<TipoFactura, number> = {
  [TipoFactura.A]: 1,
  [TipoFactura.B]: 6,
};

@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(Comprobante)
    private readonly comprobantes: Repository<Comprobante>,
    // El emisor y la factory se proveen en el módulo. Para multi-tenant,
    // en vez de un emisor fijo resolvés el emisor según el request.
    @Inject('EMISOR') private readonly emisor: Emisor,
    @Inject('ARCA_PROVIDER_FACTORY')
    private readonly crearProvider: ArcaProviderFactory,
  ) {}

  async emitirFactura(dto: CrearFacturaDto): Promise<Comprobante> {
    const { importeNeto, importeIva, importeTotal } = this.calcularTotales(dto);

    const datos: DatosComprobante = {
      tipoComprobante: CODIGO_COMPROBANTE[dto.tipo],
      docTipoReceptor: dto.receptor.docTipo,
      docNroReceptor: dto.receptor.docNro,
      fecha: new Date(),
      importeNeto,
      importeIva,
      importeTotal,
      alicuotaIva: ALICUOTA_IVA_21,
    };

    const provider = this.crearProvider(this.emisor);

    let resultado;
    try {
      resultado = await provider.solicitarCae(datos);
    } catch (error) {
      // ARCA puede rechazar (CUIT inválido, condición de IVA, timeout, etc.)
      // TODO: mapear los códigos de error de ARCA a mensajes claros y reintentar timeouts.
      throw new InternalServerErrorException(
        `ARCA rechazó el comprobante: ${(error as Error).message}`,
      );
    }

    const comprobante = this.comprobantes.create({
      emisorId: this.emisor.id,
      tipoComprobante: datos.tipoComprobante,
      puntoVenta: this.emisor.puntoVenta,
      numero: resultado.numeroComprobante,
      docTipoReceptor: datos.docTipoReceptor,
      docNroReceptor: datos.docNroReceptor,
      importeNeto,
      importeIva,
      importeTotal,
      cae: resultado.cae,
      vencimientoCae: resultado.vencimientoCae,
      ventaId: dto.ventaId,
    });

    return this.comprobantes.save(comprobante);
  }

  /**
   * Toma los precios unitarios como NETO (sin IVA) y suma 21%.
   * OJO: en una factura B el consumidor final ve el total con IVA incluido, pero
   * igual tenés que reportar el neto y el IVA por separado a ARCA. Si vos cargás
   * los precios CON IVA incluido (lo más natural en mostrador), invertí el cálculo:
   * neto = total / 1.21. Ajustalo según cómo cargue los precios tu suegro.
   */
  private calcularTotales(dto: CrearFacturaDto) {
    const importeNeto = dto.items.reduce(
      (acc, item) => acc + item.cantidad * item.precioUnitario,
      0,
    );
    const importeIva = this.redondear(importeNeto * IVA_21);
    const importeTotal = this.redondear(importeNeto + importeIva);
    return { importeNeto: this.redondear(importeNeto), importeIva, importeTotal };
  }

  private redondear(n: number): number {
    return Math.round(n * 100) / 100;
  }

  async listarPorEmisor(): Promise<Comprobante[]> {
    return this.comprobantes.find({
      where: { emisorId: this.emisor.id },
      order: { emitidoEl: 'DESC' },
    });
  }
}
