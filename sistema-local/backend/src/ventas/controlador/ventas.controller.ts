import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { VentasGestor } from '../gestor/ventas.gestor';
import { AbrirFichaDto } from '../dto/abrir-ficha.dto';
import { AgregarLineaDto } from '../dto/agregar-linea.dto';
import { FacturarFichaDto } from '../dto/facturar-ficha.dto';
import { Venta } from '../modelo/venta.entity';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasGestor) {}

  /** Abre la ficha del cliente, o devuelve la que ya tenga abierta */
  @Post('abrir')
  async abrir(@Body() dto: AbrirFichaDto) {
    const venta = await this.ventas.abrirFicha(dto.clienteId);
    return this.conTotal(venta);
  }

  /** La "pestaña de cuentas corrientes": quién tiene ficha abierta y por cuánto */
  @Get('abiertas')
  async abiertas() {
    const ventas = await this.ventas.listarAbiertas();
    return ventas.map((venta) => this.conTotal(venta));
  }

  @Get(':id')
  async obtener(@Param('id', ParseUUIDPipe) id: string) {
    const venta = await this.ventas.obtener(id);
    return this.conTotal(venta);
  }

  @Post(':id/lineas')
  async agregarLinea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AgregarLineaDto,
  ) {
    const venta = await this.ventas.agregarLinea(id, dto);
    return this.conTotal(venta);
  }

  @Delete(':id/lineas/:lineaId')
  async quitarLinea(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineaId', ParseUUIDPipe) lineaId: string,
  ) {
    const venta = await this.ventas.quitarLinea(id, lineaId);
    return this.conTotal(venta);
  }

  /** Vacía la ficha: borra todas sus líneas de un solo golpe (solo si está ABIERTA) */
  @Delete(':id/lineas')
  async vaciarLineas(@Param('id', ParseUUIDPipe) id: string) {
    const venta = await this.ventas.vaciarLineas(id);
    return this.conTotal(venta);
  }

  /** PDF de presupuesto (no fiscal, sin CAE/QR). No cambia el estado de la ficha. */
  @Post(':id/presupuesto')
  async presupuesto(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, nombreArchivo } = await this.ventas.generarPresupuesto(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${nombreArchivo}"`,
    });
  }

  /** Emite la ficha como factura (CONTADO o CUENTA_CORRIENTE) y devuelve el comprobante */
  @Post(':id/facturar')
  facturar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FacturarFichaDto,
  ) {
    return this.ventas.facturarFicha(id, dto.condicionVenta);
  }

  private conTotal(venta: Venta) {
    return { ...venta, total: venta.total() };
  }
}
