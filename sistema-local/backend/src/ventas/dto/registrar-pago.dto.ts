import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RegistrarPagoDto {
  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
