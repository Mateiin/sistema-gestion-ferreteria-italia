import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CondicionIvaCliente } from '../modelo/cliente.entity';

export class CrearClienteDto {
  @IsString()
  razonSocial: string;

  /** 80=CUIT, 96=DNI, 99=Consumidor Final (mismos códigos que usa ARCA) */
  @IsInt()
  docTipo: number;

  @IsInt()
  @Min(0)
  docNro: number;

  @IsEnum(CondicionIvaCliente)
  condicionIva: CondicionIvaCliente;

  @IsOptional()
  @IsString()
  domicilio?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}
