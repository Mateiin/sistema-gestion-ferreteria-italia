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

/** Mismos valores que usa el facturador de ARCA en su formulario web */
export enum CondicionVenta {
  CONTADO = 'CONTADO',
  TARJETA_DEBITO = 'TARJETA_DEBITO',
  TARJETA_CREDITO = 'TARJETA_CREDITO',
  CUENTA_CORRIENTE = 'CUENTA_CORRIENTE',
  CHEQUE = 'CHEQUE',
  TRANSFERENCIA_BANCARIA = 'TRANSFERENCIA_BANCARIA',
  OTRA = 'OTRA',
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

  /**
   * Código de unidad de medida de ARCA (catálogo FEParamGetTiposUnidadesMedida).
   * Opcional: si no se envía, se asume 7 ("unidades", el genérico). No lo
   * recibe WSFEv1 (no maneja líneas, solo totales) — es para nuestro registro
   * y para el detalle impreso en el PDF.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadMedida?: number;
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

  /**
   * No los pide WSFEv1 (igual que `unidadMedida`/`condicionVenta`): son solo
   * para nuestro registro y el PDF impreso. Opcionales para no romper llamadas
   * existentes; en la práctica son obligatorios para que la Factura A impresa
   * tenga sentido.
   */
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  domicilio?: string;
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

  /**
   * Cómo se cobró (mismos valores que el facturador de ARCA). Si es
   * CUENTA_CORRIENTE, la venta es fiada: el módulo de cuentas corrientes va a
   * usar este dato para generar el cargo (todavía no existe, ver TODO(ctacte)
   * en el Gestor).
   */
  @IsEnum(CondicionVenta)
  condicionVenta: CondicionVenta;

  /** Vínculo opcional con la venta interna que originó la factura */
  @IsOptional()
  @IsString()
  ventaId?: string;
}
