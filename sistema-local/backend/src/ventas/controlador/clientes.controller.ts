import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClientesGestor } from '../gestor/clientes.gestor';
import { CuentaCorrienteGestor } from '../gestor/cuenta-corriente.gestor';
import { CrearClienteDto } from '../dto/crear-cliente.dto';
import { ActualizarClienteDto } from '../dto/actualizar-cliente.dto';
import { RegistrarPagoDto } from '../dto/registrar-pago.dto';

@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientes: ClientesGestor,
    private readonly cuentaCorriente: CuentaCorrienteGestor,
  ) {}

  @Post()
  crear(@Body() dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }

  /** Búsqueda por nombre vía ?nombre= (sin query, lista todos) */
  @Get()
  buscar(@Query('nombre') nombre?: string) {
    return this.clientes.buscar(nombre);
  }

  /** La vista "quién me debe": clientes con saldo > 0. Antes de ':id' a propósito. */
  @Get('con-saldo')
  conSaldo() {
    return this.cuentaCorriente.listarConSaldo();
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientes.obtener(id);
  }

  @Put(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(id, dto);
  }

  /** Saldo actual del cliente + historial de movimientos de cuenta corriente */
  @Get(':id/cuenta')
  cuenta(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuentaCorriente.obtenerCuenta(id);
  }

  /** Registra un pago (imputación global, no contra una factura puntual) */
  @Post(':id/pagos')
  pagar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarPagoDto,
  ) {
    return this.cuentaCorriente.registrarPago(id, dto);
  }
}
