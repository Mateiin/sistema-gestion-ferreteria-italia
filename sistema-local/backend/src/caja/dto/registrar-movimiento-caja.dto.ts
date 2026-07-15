import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { MedioPago, TipoMovimientoCaja } from '../modelo/movimiento-caja.entity';

export class RegistrarMovimientoCajaDto {
  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(MedioPago)
  medioPago?: MedioPago;

  /** Default VENTA. RETIRO = plata que sale de la caja (siempre efectivo). */
  @IsOptional()
  @IsEnum(TipoMovimientoCaja)
  tipo?: TipoMovimientoCaja;

  /** Presente solo al agregar un movimiento a un día YA cerrado (edición
   * desde Registros): ata el movimiento a ese cierre en vez de a la caja del
   * día en curso, y su fecha pasa a ser la del cierre, no la de hoy. */
  @IsOptional()
  @IsUUID()
  cierreId?: string;
}
