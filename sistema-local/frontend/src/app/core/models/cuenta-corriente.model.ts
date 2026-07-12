import { Cliente } from './cliente.model';

export enum TipoMovimientoCtaCte {
  CARGO = 'CARGO',
  PAGO = 'PAGO',
}

export interface MovimientoCtaCte {
  id: string;
  clienteId: string;
  tipo: TipoMovimientoCtaCte;
  monto: number | string;
  fecha: string;
  comprobanteId?: string | null;
  descripcion?: string | null;
  createdAt: string;
}

export interface CuentaCliente {
  saldo: number;
  movimientos: MovimientoCtaCte[];
}

export interface ClienteConSaldo {
  cliente: Cliente;
  saldo: number;
}
