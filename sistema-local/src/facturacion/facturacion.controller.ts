import { Body, Controller, Get, Post } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';
import { CrearFacturaDto } from './dto/crear-factura.dto';

@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacion: FacturacionService) {}

  /** Emite una factura y devuelve el comprobante con su CAE */
  @Post('facturas')
  emitir(@Body() dto: CrearFacturaDto) {
    return this.facturacion.emitirFactura(dto);
  }

  /** Lista los comprobantes ya emitidos */
  @Get('facturas')
  listar() {
    return this.facturacion.listarPorEmisor();
  }
}
