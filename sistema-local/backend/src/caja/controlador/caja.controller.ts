import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CajaGestor } from '../gestor/caja.gestor';
import { RegistrarMovimientoCajaDto } from '../dto/registrar-movimiento-caja.dto';
import { CerrarCajaDto } from '../dto/cerrar-caja.dto';

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaGestor) {}

  @Post('movimientos')
  registrar(@Body() dto: RegistrarMovimientoCajaDto) {
    return this.caja.registrar(dto);
  }

  /** Movimientos todavía abiertos (sin cerrar) de un día (default hoy), con
   * total y desglose por medio de pago */
  @Get('dia')
  dia(@Query('fecha') fecha?: string) {
    return this.caja.obtenerDia(fecha);
  }

  @Delete('movimientos/:id')
  borrar(@Param('id', ParseUUIDPipe) id: string) {
    return this.caja.borrar(id);
  }

  /** Total por día en un rango, para ver días anteriores */
  @Get('resumen')
  resumen(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.caja.resumen(desde, hasta);
  }

  /** Cierra la caja del día (arqueo): un cierre por día como mucho. */
  @Post('cierres')
  cerrar(@Body() dto: CerrarCajaDto) {
    return this.caja.cerrarDia(dto.fecha);
  }

  /** Listado de cierres (pantalla "Registros"). */
  @Get('cierres')
  listarCierres() {
    return this.caja.listarCierres();
  }

  /** Detalle de un cierre con sus movimientos (pantalla de edición). */
  @Get('cierres/:id')
  obtenerCierre(@Param('id', ParseUUIDPipe) id: string) {
    return this.caja.obtenerCierre(id);
  }
}
