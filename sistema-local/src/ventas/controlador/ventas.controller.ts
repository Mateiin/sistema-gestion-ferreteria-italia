import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { VentasGestor } from '../gestor/ventas.gestor';
import { AbrirFichaDto } from '../dto/abrir-ficha.dto';
import { AgregarLineaDto } from '../dto/agregar-linea.dto';
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

  private conTotal(venta: Venta) {
    return { ...venta, total: venta.total() };
  }
}
