import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EstadoVenta,
  FichaNoAbiertaError,
  FichaSinLineasError,
  Venta,
} from '../modelo/venta.entity';
import { LineaVenta } from '../modelo/linea-venta.entity';
import { MovimientoCtaCte } from '../modelo/movimiento-cta-cte.entity';
import { AgregarLineaDto } from '../dto/agregar-linea.dto';
import { PresupuestoPdfProvider } from '../pdf/presupuesto-pdf.provider';
import { FacturacionGestor } from '../../facturacion/gestor/facturacion.gestor';
import {
  CondicionIvaReceptorDto,
  CondicionVenta,
  CrearFacturaDto,
  TipoFactura,
} from '../../facturacion/dto/crear-factura.dto';
import { Comprobante } from '../../facturacion/modelo/comprobante.entity';

/**
 * GESTOR (GRASP Controller). Orquesta la ficha de venta: pide al repositorio,
 * valida que la ficha esté ABIERTA antes de tocar sus líneas y delega el
 * cálculo del total al Modelo (`Venta.total()`). No calcula nada él mismo.
 */
@Injectable()
export class VentasGestor {
  private readonly logger = new Logger(VentasGestor.name);

  constructor(
    @InjectRepository(Venta)
    private readonly ventas: Repository<Venta>,
    @InjectRepository(LineaVenta)
    private readonly lineas: Repository<LineaVenta>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly pdfProvider: PresupuestoPdfProvider,
    private readonly facturacion: FacturacionGestor,
  ) {}

  /**
   * Devuelve la ficha ABIERTA del cliente si ya existe, o crea una nueva.
   * Nunca hay dos abiertas para el mismo cliente (reforzado también con un
   * índice único parcial en la base, ver migración AddClientesYVentas).
   */
  async abrirFicha(clienteId: string): Promise<Venta> {
    const abierta = await this.ventas.findOne({
      where: { clienteId, estado: EstadoVenta.ABIERTA },
    });
    if (abierta) {
      return this.obtener(abierta.id);
    }
    const nueva = await this.ventas.save(
      this.ventas.create({ clienteId, estado: EstadoVenta.ABIERTA }),
    );
    return this.obtener(nueva.id);
  }

  async obtener(id: string): Promise<Venta> {
    const venta = await this.ventas.findOne({
      where: { id },
      relations: { lineas: true, cliente: true },
    });
    if (!venta) {
      throw new NotFoundException('Ficha no encontrada');
    }
    return venta;
  }

  listarAbiertas(): Promise<Venta[]> {
    return this.ventas.find({
      where: { estado: EstadoVenta.ABIERTA },
      relations: { lineas: true, cliente: true },
      order: { createdAt: 'ASC' },
    });
  }

  async agregarLinea(ventaId: string, dto: AgregarLineaDto): Promise<Venta> {
    const venta = await this.obtener(ventaId);
    this.validarAbierta(venta);
    await this.lineas.save(this.lineas.create({ ...dto, ventaId }));
    return this.obtener(ventaId);
  }

  async quitarLinea(ventaId: string, lineaId: string): Promise<Venta> {
    const venta = await this.obtener(ventaId);
    this.validarAbierta(venta);
    if (!venta.lineas.some((linea) => linea.id === lineaId)) {
      throw new NotFoundException('Línea no encontrada en esta ficha');
    }
    await this.lineas.delete(lineaId);
    return this.obtener(ventaId);
  }

  private validarAbierta(venta: Venta): void {
    if (venta.estado !== EstadoVenta.ABIERTA) {
      throw new BadRequestException(
        `La ficha está ${venta.estado}: no se pueden modificar sus líneas`,
      );
    }
  }

  /**
   * Presupuesto: PDF no fiscal armado directo desde la ficha, sin tocar ARCA.
   * No cambia el estado ni ningún saldo — se puede pedir las veces que haga
   * falta.
   */
  async generarPresupuesto(
    ventaId: string,
  ): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const venta = await this.obtener(ventaId);
    const buffer = await this.pdfProvider.generar(venta);
    return { buffer, nombreArchivo: venta.nombreArchivoPresupuesto() };
  }

  /**
   * Emite la ficha como factura. Orden importante por el efecto externo: primero
   * se pide el CAE a ARCA (vía FacturacionGestor, que ya persiste el Comprobante);
   * recién con el CAE en mano se actualiza la Venta y se crea el cargo en cuenta
   * corriente, en una única transacción de DB. Si ARCA falla, no se tocó nada:
   * la ficha sigue ABIERTA. Si falla el paso de DB con el CAE ya emitido, NO se
   * intenta deshacer el CAE (no se puede): se loguea fuerte para intervención
   * manual — el Comprobante ya quedó guardado y es recuperable vinculándolo.
   */
  async facturarFicha(
    ventaId: string,
    condicionVenta: CondicionVenta,
  ): Promise<Comprobante> {
    const venta = await this.obtener(ventaId);
    try {
      venta.validarPuedeFacturar();
    } catch (error) {
      if (error instanceof FichaNoAbiertaError || error instanceof FichaSinLineasError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const dto = this.armarDtoFactura(venta, condicionVenta);
    const comprobante = await this.facturacion.emitirFactura(dto);

    try {
      await this.dataSource.transaction(async (manager) => {
        venta.marcarEmitida(comprobante.id);
        await manager.save(venta);

        if (condicionVenta === CondicionVenta.CUENTA_CORRIENTE) {
          const cargo = MovimientoCtaCte.crearCargo(
            venta.clienteId,
            comprobante.importeTotal,
            comprobante.id,
          );
          await manager.save(cargo);
        }
        // TODO(caja): si condicionVenta === CONTADO, cuando exista el módulo
        // de caja, acá se registra el ingreso correspondiente.
      });
    } catch (error) {
      this.logger.error(
        `La factura ${comprobante.id} (CAE ${comprobante.cae}) ya fue autorizada por ARCA, ` +
          `pero falló al actualizar la ficha ${venta.id} / cuenta corriente. El CAE es válido ` +
          `y el Comprobante ya está guardado: requiere vincularlo a mano, NO reintentar la emisión.`,
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        `La factura se emitió correctamente (CAE ${comprobante.cae}), pero hubo un error ` +
          `actualizando la ficha. Contactar soporte con este CAE para vincularlo a mano.`,
      );
    }

    return comprobante;
  }

  /**
   * Arma el CrearFacturaDto a partir de la ficha: el tipo de factura lo
   * decide el Cliente (Information Expert, según su condición de IVA — el
   * emisor es RI); acá solo se traducen las líneas y el receptor al formato
   * que espera `FacturacionGestor.emitirFactura`.
   */
  private armarDtoFactura(venta: Venta, condicionVenta: CondicionVenta): CrearFacturaDto {
    const cliente = venta.cliente;
    const dto = new CrearFacturaDto();
    dto.tipo = cliente.tipoFacturaCorrespondiente() as TipoFactura;
    dto.receptor = {
      docTipo: cliente.docTipo,
      docNro: Number(cliente.docNro),
      condicionIva: cliente.condicionIva as unknown as CondicionIvaReceptorDto,
      razonSocial: cliente.razonSocial,
      domicilio: cliente.domicilio,
    };
    dto.items = venta.lineas.map((linea) => ({
      descripcion: linea.descripcion,
      cantidad: Number(linea.cantidad),
      precioUnitario: Number(linea.precioUnitario),
      ivaPorcentaje: Number(linea.ivaPorcentaje),
      unidadMedida: linea.unidadMedida,
    }));
    dto.condicionVenta = condicionVenta;
    dto.ventaId = venta.id;
    return dto;
  }
}
