import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { FacturacionGestor } from '../gestor/facturacion.gestor';
import { CrearFacturaDto } from '../dto/crear-factura.dto';

@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacion: FacturacionGestor) {}

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

  /** Anula un comprobante emitiendo la Nota de Crédito correspondiente */
  @Post('facturas/:id/nota-credito')
  anular(@Param('id', ParseUUIDPipe) id: string) {
    return this.facturacion.anularFactura(id);
  }
}
