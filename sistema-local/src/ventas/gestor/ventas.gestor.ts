import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoVenta, Venta } from '../modelo/venta.entity';
import { LineaVenta } from '../modelo/linea-venta.entity';
import { AgregarLineaDto } from '../dto/agregar-linea.dto';

/**
 * GESTOR (GRASP Controller). Orquesta la ficha de venta: pide al repositorio,
 * valida que la ficha esté ABIERTA antes de tocar sus líneas y delega el
 * cálculo del total al Modelo (`Venta.total()`). No calcula nada él mismo.
 */
@Injectable()
export class VentasGestor {
  constructor(
    @InjectRepository(Venta)
    private readonly ventas: Repository<Venta>,
    @InjectRepository(LineaVenta)
    private readonly lineas: Repository<LineaVenta>,
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

  // TODO(fase2-emision): acá va a ir emitir la ficha como factura (reusando
  // FacturacionGestor, con condicionVenta CONTADO/CUENTA_CORRIENTE según
  // corresponda) o imprimirla como presupuesto no fiscal (no cierra la ficha).
}
