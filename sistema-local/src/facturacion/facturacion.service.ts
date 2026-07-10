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

/** IVA por defecto en una ferretería (la mayoría de los productos van al 21%) */
const IVA_DEFECTO = 21;

/** Mapeo de nuestro enum a los códigos de comprobante de ARCA (para persistir) */
const CODIGO_COMPROBANTE: Record<TipoFactura, number> = {
  [TipoFactura.A]: 1,
  [TipoFactura.B]: 6,
};

@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(Comprobante)
    private readonly comprobantes: Repository<Comprobante>,
    // Emisor único para el MVP. Para multi-tenant, resolvés el emisor por request.
    @Inject('EMISOR') private readonly emisor: Emisor,
    @Inject('ARCA_PROVIDER_FACTORY')
    private readonly crearProvider: ArcaProviderFactory,
  ) {}

  async emitirFactura(dto: CrearFacturaDto): Promise<Comprobante> {
    // El service NO calcula IVA ni totales: solo traduce el pedido al dominio.
    // El adapter se ocupa de discriminar por alícuota y de pedir el CAE.
    const datos: DatosComprobante = {
      tipoFactura: dto.tipo,
      docTipoReceptor: dto.receptor.docTipo,
      docNroReceptor: dto.receptor.docNro,
      // La condición de IVA del receptor solo hace falta en Factura A.
      condicionIvaReceptor:
        dto.tipo === TipoFactura.A
          ? (dto.receptor.condicionIva ?? 'RESPONSABLE_INSCRIPTO')
          : undefined,
      items: dto.items.map((item) => ({
        neto: this.redondear(item.cantidad * item.precioUnitario),
        ivaPorcentaje: item.ivaPorcentaje ?? IVA_DEFECTO,
      })),
    };

    const provider = this.crearProvider(this.emisor);

    let resultado;
    try {
      resultado = await provider.solicitarCae(datos);
    } catch (error) {
      // TODO: mapear los códigos de error de ARCA a mensajes claros y reintentar timeouts.
      throw new InternalServerErrorException(
        `ARCA rechazó el comprobante: ${(error as Error).message}`,
      );
    }

    // Persistimos los totales tal como los autorizó ARCA (fuente de verdad).
    const comprobante = this.comprobantes.create({
      emisorId: this.emisor.id,
      tipoComprobante: CODIGO_COMPROBANTE[dto.tipo],
      puntoVenta: this.emisor.puntoVenta,
      numero: resultado.numeroComprobante,
      docTipoReceptor: datos.docTipoReceptor,
      docNroReceptor: datos.docNroReceptor,
      importeNeto: resultado.importeNeto,
      importeIva: resultado.importeIva,
      importeTotal: resultado.importeTotal,
      cae: resultado.cae,
      vencimientoCae: resultado.vencimientoCae,
      ventaId: dto.ventaId,
    });

    return this.comprobantes.save(comprobante);
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
