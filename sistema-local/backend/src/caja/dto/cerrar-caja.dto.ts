import { IsDateString, IsOptional } from 'class-validator';

export class CerrarCajaDto {
  /** Default: hoy (fecha local del comercio, ver `fechaHoy()` del gestor). */
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
