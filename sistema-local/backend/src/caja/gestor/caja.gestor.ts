import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MedioPago, MovimientoCaja } from '../modelo/movimiento-caja.entity';
import { RegistrarMovimientoCajaDto } from '../dto/registrar-movimiento-caja.dto';

export interface DiaCaja {
  fecha: string;
  movimientos: MovimientoCaja[];
  total: number;
  porMedioPago: Record<MedioPago, number>;
}

export interface ResumenDia {
  fecha: string;
  total: number;
}

/** Fecha local (no UTC) — ver el comentario en `MovimientoCaja`. */
function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/**
 * GESTOR (GRASP Controller). Registro diario de ventas cargado a mano: sin
 * apertura/cierre de caja ni arqueo. No calcula nada él mismo: el total y el
 * desglose por medio de pago los deriva `MovimientoCaja` (Modelo).
 */
@Injectable()
export class CajaGestor {
  constructor(
    @InjectRepository(MovimientoCaja)
    private readonly movimientos: Repository<MovimientoCaja>,
  ) {}

  registrar(dto: RegistrarMovimientoCajaDto): Promise<MovimientoCaja> {
    return this.movimientos.save(
      MovimientoCaja.crear(dto.monto, dto.descripcion, dto.medioPago),
    );
  }

  async obtenerDia(fecha?: string): Promise<DiaCaja> {
    const fechaConsultada = fecha ?? fechaHoy();
    const movimientos = await this.movimientos.find({
      where: { fecha: fechaConsultada },
      order: { createdAt: 'DESC' },
    });
    return {
      fecha: fechaConsultada,
      movimientos,
      total: MovimientoCaja.calcularTotal(movimientos),
      porMedioPago: MovimientoCaja.calcularPorMedioPago(movimientos),
    };
  }

  async borrar(id: string): Promise<void> {
    const existe = await this.movimientos.exists({ where: { id } });
    if (!existe) {
      throw new NotFoundException('Movimiento no encontrado');
    }
    await this.movimientos.delete(id);
  }

  async resumen(desde: string, hasta: string): Promise<ResumenDia[]> {
    const movimientos = await this.movimientos.find({
      where: { fecha: Between(desde, hasta) },
    });

    const porFecha = new Map<string, MovimientoCaja[]>();
    for (const mov of movimientos) {
      const lista = porFecha.get(mov.fecha) ?? [];
      lista.push(mov);
      porFecha.set(mov.fecha, lista);
    }

    return [...porFecha.entries()]
      .map(([fecha, movs]) => ({ fecha, total: MovimientoCaja.calcularTotal(movs) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
}
