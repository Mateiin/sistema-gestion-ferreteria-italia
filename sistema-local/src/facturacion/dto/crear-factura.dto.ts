import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoFactura {
  A = 'A', // a otro Responsable Inscripto (discrimina IVA)
  B = 'B', // a consumidor final / monotributista
}

export enum CondicionIvaReceptorDto {
  RESPONSABLE_INSCRIPTO = 'RESPONSABLE_INSCRIPTO',
  MONOTRIBUTO = 'MONOTRIBUTO',
  EXENTO = 'EXENTO',
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
}

export class ItemFacturaDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0)
  cantidad: number;

  /**
   * En Factura A es NETO (sin IVA). En Factura B (y C) ya viene CON IVA
   * incluido — confirmado contra el facturador de ARCA. Ver
   * `Comprobante.calcularImportesLinea`, que rama según el tipo.
   */
  @IsNumber()
  @Min(0)
  precioUnitario: number;

  /** Alícuota de IVA en %. Opcional: si no se envía, se asume 21. */
  @IsOptional()
  @IsIn([21, 10.5])
  ivaPorcentaje?: number;
}

export class ReceptorDto {
  /** 80=CUIT, 96=DNI, 99=Consumidor Final */
  @IsInt()
  docTipo: number;

  /** 0 si es consumidor final sin identificar */
  @IsInt()
  docNro: number;

  /** Requerido para Factura A. Para B se puede omitir. */
  @IsOptional()
  @IsEnum(CondicionIvaReceptorDto)
  condicionIva?: CondicionIvaReceptorDto;
}

export class CrearFacturaDto {
  @IsEnum(TipoFactura)
  tipo: TipoFactura;

  @ValidateNested()
  @Type(() => ReceptorDto)
  receptor: ReceptorDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  items: ItemFacturaDto[];

  /** Vínculo opcional con la venta interna que originó la factura */
  @IsOptional()
  @IsString()
  ventaId?: string;
}
