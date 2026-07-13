import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AgregarLineaDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0)
  cantidad: number;

  @IsNumber()
  @Min(0)
  precioUnitario: number;

  /** Alícuota de IVA en %. Opcional: si no se envía, se asume 21. */
  @IsOptional()
  @IsIn([21, 10.5])
  ivaPorcentaje?: number;

  /**
   * Código de unidad de medida de ARCA. Opcional: si no se envía, se asume
   * 7 ("unidades", el genérico).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadMedida?: number;
}
