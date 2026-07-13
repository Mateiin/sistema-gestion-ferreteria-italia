import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MedioPago } from '../modelo/movimiento-caja.entity';

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
}
