import {
  IsArray,
  IsEnum,
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

export class ItemFacturaDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0)
  cantidad: number;

  /** Precio unitario SIN IVA (neto). Ver nota sobre IVA en el service. */
  @IsNumber()
  @Min(0)
  precioUnitario: number;
}

export class ReceptorDto {
  /** 80=CUIT, 96=DNI, 99=Consumidor Final */
  @IsInt()
  docTipo: number;

  /** 0 si es consumidor final sin identificar */
  @IsInt()
  docNro: number;
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
