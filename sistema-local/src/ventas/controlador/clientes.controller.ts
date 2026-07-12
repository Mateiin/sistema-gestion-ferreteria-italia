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
import { CrearClienteDto } from '../dto/crear-cliente.dto';
import { ActualizarClienteDto } from '../dto/actualizar-cliente.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesGestor) {}

  @Post()
  crear(@Body() dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }

  /** Búsqueda por nombre vía ?nombre= (sin query, lista todos) */
  @Get()
  buscar(@Query('nombre') nombre?: string) {
    return this.clientes.buscar(nombre);
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
}
