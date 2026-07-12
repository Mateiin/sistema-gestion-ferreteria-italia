import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../modelo/cliente.entity';
import { MovimientoCtaCte } from '../modelo/movimiento-cta-cte.entity';
import { RegistrarPagoDto } from '../dto/registrar-pago.dto';

export interface CuentaCliente {
  saldo: number;
  movimientos: MovimientoCtaCte[];
}

/**
 * GESTOR (GRASP Controller). El CARGO por una factura en cuenta corriente lo
 * crea `VentasGestor.facturarFicha` (necesita ser atómico con la
 * actualización de la ficha). Este Gestor cubre lo que se opera desde el
 * lado del cliente: registrar pagos y consultar la cuenta. No calcula nada
 * él mismo: el saldo lo deriva `MovimientoCtaCte.calcularSaldo` (Modelo).
 */
@Injectable()
export class CuentaCorrienteGestor {
  constructor(
    @InjectRepository(MovimientoCtaCte)
    private readonly movimientos: Repository<MovimientoCtaCte>,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
  ) {}

  /**
   * Pago del cliente. Imputación GLOBAL, no contra una factura puntual: es
   * el caso secundario del flujo del suegro (él salda casi todo al facturar
   * en contado), así que se mantiene simple a propósito — ver "Ventas
   * (Ficha)" en CLAUDE.md.
   */
  async registrarPago(clienteId: string, dto: RegistrarPagoDto): Promise<CuentaCliente> {
    await this.verificarClienteExiste(clienteId);
    await this.movimientos.save(
      MovimientoCtaCte.crearPago(clienteId, dto.monto, dto.descripcion),
    );
    return this.obtenerCuenta(clienteId);
  }

  async obtenerCuenta(clienteId: string): Promise<CuentaCliente> {
    await this.verificarClienteExiste(clienteId);
    const movimientos = await this.movimientos.find({
      where: { clienteId },
      order: { fecha: 'ASC', createdAt: 'ASC' },
    });
    return { saldo: MovimientoCtaCte.calcularSaldo(movimientos), movimientos };
  }

  /** La vista "quién me debe": clientes con saldo positivo. */
  async listarConSaldo(): Promise<{ cliente: Cliente; saldo: number }[]> {
    const [clientes, movimientos] = await Promise.all([
      this.clientes.find(),
      this.movimientos.find(),
    ]);

    const porCliente = new Map<string, MovimientoCtaCte[]>();
    for (const mov of movimientos) {
      const lista = porCliente.get(mov.clienteId) ?? [];
      lista.push(mov);
      porCliente.set(mov.clienteId, lista);
    }

    return clientes
      .map((cliente) => ({
        cliente,
        saldo: MovimientoCtaCte.calcularSaldo(porCliente.get(cliente.id) ?? []),
      }))
      .filter((c) => c.saldo > 0)
      .sort((a, b) => a.cliente.razonSocial.localeCompare(b.cliente.razonSocial));
  }

  private async verificarClienteExiste(clienteId: string): Promise<void> {
    const existe = await this.clientes.exists({ where: { id: clienteId } });
    if (!existe) {
      throw new NotFoundException('Cliente no encontrado');
    }
  }
}
