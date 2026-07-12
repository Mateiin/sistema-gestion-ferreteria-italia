import { IsIn } from 'class-validator';
import { CondicionVenta } from '../../facturacion/dto/crear-factura.dto';

/** La ficha solo se puede facturar CONTADO o CUENTA_CORRIENTE (el resto de
 * los valores de CondicionVenta son para facturación directa, sin ficha). */
export class FacturarFichaDto {
  @IsIn([CondicionVenta.CONTADO, CondicionVenta.CUENTA_CORRIENTE])
  condicionVenta: CondicionVenta;
}
