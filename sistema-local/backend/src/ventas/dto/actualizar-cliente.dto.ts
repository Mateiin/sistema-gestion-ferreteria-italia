import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CondicionIvaCliente } from '../modelo/cliente.entity';

export class ActualizarClienteDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsInt()
  docTipo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  docNro?: number;

  @IsOptional()
  @IsEnum(CondicionIvaCliente)
  condicionIva?: CondicionIvaCliente;

  @IsOptional()
  @IsString()
  domicilio?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
