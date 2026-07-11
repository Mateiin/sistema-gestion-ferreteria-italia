import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Comprobante,
  ComprobanteYaAnuladoError,
  SinDesgloseIvaError,
} from '../modelo/comprobante.entity';
import { CrearFacturaDto, TipoFactura } from '../dto/crear-factura.dto';
import { Emisor } from '../config/emisor';
import { ArcaProviderFactory } from '../interfaces/arca-provider.interface';
import { ComprobantePdfProvider } from '../pdf/comprobante-pdf.provider';

/** Mapeo de nuestro enum a los códigos de comprobante de ARCA (para persistir) */
const CODIGO_COMPROBANTE: Record<TipoFactura, number> = {
  [TipoFactura.A]: 1,
  [TipoFactura.B]: 6,
};

/** Notas de crédito: siguen la misma letra que la factura que anulan */
const CODIGO_NOTA_CREDITO: Record<TipoFactura, number> = {
  [TipoFactura.A]: 3,
  [TipoFactura.B]: 8,
};

/** Inversa de CODIGO_COMPROBANTE, para reconstruir la NC a partir de lo persistido */
const TIPO_FACTURA_POR_CODIGO: Record<number, TipoFactura> = {
  1: TipoFactura.A,
  6: TipoFactura.B,
};

/**
 * GESTOR (GRASP Controller). No calcula IVA, no valida reglas de negocio: eso
 * vive en `Comprobante` (Modelo). Este Gestor solo instancia/obtiene la
 * entidad, le delega el cálculo o la validación, llama al puerto externo
 * (ArcaProvider) con lo que la entidad calculó, y persiste el resultado.
 */
@Injectable()
export class FacturacionGestor {
  constructor(
    @InjectRepository(Comprobante)
    private readonly comprobantes: Repository<Comprobante>,
    // Emisor único para el MVP. Para multi-tenant, resolvés el emisor por request.
    @Inject('EMISOR') private readonly emisor: Emisor,
    @Inject('ARCA_PROVIDER_FACTORY')
    private readonly crearProvider: ArcaProviderFactory,
    private readonly pdfProvider: ComprobantePdfProvider,
  ) {}

  async emitirFactura(dto: CrearFacturaDto): Promise<Comprobante> {
    const desglose = Comprobante.calcularDesglose(dto.tipo, dto.items);
    const detalle = Comprobante.armarDetalle(dto.tipo, dto.items);
    const condicionIvaReceptor = Comprobante.condicionIvaRequerida(
      dto.tipo,
      dto.receptor.condicionIva,
    );

    const provider = this.crearProvider(this.emisor);
    let resultado;
    try {
      resultado = await provider.solicitarCae({
        tipoFactura: dto.tipo,
        docTipoReceptor: dto.receptor.docTipo,
        docNroReceptor: dto.receptor.docNro,
        condicionIvaReceptor,
        ivaDesglose: desglose,
        ...Comprobante.totalizar(desglose),
      });
    } catch (error) {
      // TODO: mapear los códigos de error de ARCA a mensajes claros y reintentar timeouts.
      throw new InternalServerErrorException(
        `ARCA rechazó el comprobante: ${(error as Error).message}`,
      );
    }

    const comprobante = Comprobante.crearAutorizado(
      {
        emisorId: this.emisor.id,
        tipoComprobante: CODIGO_COMPROBANTE[dto.tipo],
        puntoVenta: this.emisor.puntoVenta,
        docTipoReceptor: dto.receptor.docTipo,
        docNroReceptor: dto.receptor.docNro,
        condicionIvaReceptor,
        ventaId: dto.ventaId,
        detalle,
      },
      desglose,
      resultado,
    );

    return this.comprobantes.save(comprobante);
  }

  /**
   * Anula un comprobante emitido con una Nota de Crédito por el importe total.
   * Toda la validación (¿se puede anular?) y el armado de los datos vive en
   * `Comprobante.prepararNotaCredito`; acá solo se coordina la secuencia.
   */
  async anularFactura(comprobanteId: string): Promise<Comprobante> {
    const original = await this.comprobantes.findOne({
      where: { id: comprobanteId, emisorId: this.emisor.id },
    });
    if (!original) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    const tipoFactura = TIPO_FACTURA_POR_CODIGO[original.tipoComprobante];
    if (!tipoFactura) {
      throw new BadRequestException(
        `No se puede emitir una Nota de Crédito para el tipo de comprobante ${original.tipoComprobante}`,
      );
    }

    let datosNc;
    try {
      datosNc = original.prepararNotaCredito(tipoFactura);
    } catch (error) {
      if (
        error instanceof ComprobanteYaAnuladoError ||
        error instanceof SinDesgloseIvaError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const provider = this.crearProvider(this.emisor);
    let resultado;
    try {
      resultado = await provider.solicitarNotaCredito(datosNc);
    } catch (error) {
      // TODO: mapear los códigos de error de ARCA a mensajes claros y reintentar timeouts.
      throw new InternalServerErrorException(
        `ARCA rechazó la nota de crédito: ${(error as Error).message}`,
      );
    }

    const notaCredito = original.registrarNotaCredito(
      CODIGO_NOTA_CREDITO[tipoFactura],
      resultado,
    );
    await this.comprobantes.save([original, notaCredito]);

    return notaCredito;
  }

  async listarPorEmisor(): Promise<Comprobante[]> {
    return this.comprobantes.find({
      where: { emisorId: this.emisor.id },
      order: { emitidoEl: 'DESC' },
    });
  }

  /**
   * Busca el comprobante y le delega el armado del PDF al provider. El
   * nombre de archivo lo arma el propio comprobante (Information Expert).
   */
  async generarPdf(
    comprobanteId: string,
  ): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const comprobante = await this.comprobantes.findOne({
      where: { id: comprobanteId, emisorId: this.emisor.id },
    });
    if (!comprobante) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    const buffer = await this.pdfProvider.generar(comprobante, this.emisor);
    return { buffer, nombreArchivo: comprobante.nombreArchivoPdf() };
  }
}
