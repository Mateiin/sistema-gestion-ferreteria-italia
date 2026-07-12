import { IsUUID } from 'class-validator';

export class AbrirFichaDto {
  @IsUUID()
  clienteId: string;
}
