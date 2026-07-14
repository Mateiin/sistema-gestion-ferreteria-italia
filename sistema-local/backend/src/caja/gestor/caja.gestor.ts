import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { MedioPago, MovimientoCaja } from '../modelo/movimiento-caja.entity';
import { CierreCaja } from '../modelo/cierre-caja.entity';
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

export interface CierreConMovimientos {
  cierre: CierreCaja;
  movimientos: MovimientoCaja[];
}

/** Fecha local (no UTC) — ver el comentario en `MovimientoCaja`. */
function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/**
 * GESTOR (GRASP Controller). Registro diario de ventas cargado a mano, con
 * un cierre/arqueo simple por encima. No calcula nada él mismo: el total y
 * el desglose por medio de pago los deriva `MovimientoCaja`/`CierreCaja`
 * (Modelo).
 */
@Injectable()
export class CajaGestor {
  constructor(
    @InjectRepository(MovimientoCaja)
    private readonly movimientos: Repository<MovimientoCaja>,
    @InjectRepository(CierreCaja)
    private readonly cierres: Repository<CierreCaja>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async registrar(dto: RegistrarMovimientoCajaDto): Promise<MovimientoCaja> {
    if (!dto.cierreId) {
      return this.movimientos.save(MovimientoCaja.crear(dto.monto, dto.descripcion, dto.medioPago));
    }

    // Alta sobre un día ya cerrado (edición desde Registros): la fecha del
    // movimiento pasa a ser la del cierre, no la de hoy, y se recalculan los
    // totales guardados del cierre a partir de sus movimientos vigentes.
    const cierre = await this.cierres.findOneBy({ id: dto.cierreId });
    if (!cierre) {
      throw new NotFoundException('Cierre no encontrado');
    }
    const nuevo = MovimientoCaja.crear(dto.monto, dto.descripcion, dto.medioPago, cierre.fecha);
    nuevo.cierreId = cierre.id;

    return this.dataSource.transaction(async (manager) => {
      const guardado = await manager.save(nuevo);
      await this.recalcularCierre(manager, cierre);
      return guardado;
    });
  }

  /** Movimientos todavía sin cerrar de un día (default hoy) — es la caja del
   * día en curso: al cerrarla, sus movimientos se archivan bajo un
   * `CierreCaja` y dejan de aparecer acá. */
  async obtenerDia(fecha?: string): Promise<DiaCaja> {
    const fechaConsultada = fecha ?? fechaHoy();
    const movimientos = await this.movimientos.find({
      where: { fecha: fechaConsultada, cierreId: IsNull() },
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
    const movimiento = await this.movimientos.findOneBy({ id });
    if (!movimiento) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    if (!movimiento.cierreId) {
      await this.movimientos.delete(id);
      return;
    }

    // Borrado sobre un día ya cerrado: recalcular el cierre después.
    const cierre = await this.cierres.findOneBy({ id: movimiento.cierreId });
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(MovimientoCaja, id);
      if (cierre) await this.recalcularCierre(manager, cierre);
    });
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

  /** Cierra la caja de un día (default hoy): calcula el arqueo a partir de
   * los movimientos todavía abiertos de esa fecha, lo persiste y los archiva
   * bajo el cierre creado. Un cierre por día como mucho. */
  async cerrarDia(fecha?: string): Promise<CierreCaja> {
    const fechaCierre = fecha ?? fechaHoy();

    const yaExiste = await this.cierres.findOneBy({ fecha: fechaCierre });
    if (yaExiste) {
      throw new ConflictException('La caja de esta fecha ya fue cerrada');
    }

    return this.dataSource.transaction(async (manager) => {
      const movimientos = await manager.find(MovimientoCaja, {
        where: { fecha: fechaCierre, cierreId: IsNull() },
      });
      const cierre = await manager.save(CierreCaja.crear(fechaCierre, movimientos));
      await manager.update(
        MovimientoCaja,
        { fecha: fechaCierre, cierreId: IsNull() },
        { cierreId: cierre.id },
      );
      return cierre;
    });
  }

  listarCierres(): Promise<CierreCaja[]> {
    return this.cierres.find({ order: { fecha: 'DESC' } });
  }

  async obtenerCierre(id: string): Promise<CierreConMovimientos> {
    const cierre = await this.cierres.findOneBy({ id });
    if (!cierre) {
      throw new NotFoundException('Cierre no encontrado');
    }
    const movimientos = await this.movimientos.find({
      where: { cierreId: id },
      order: { createdAt: 'DESC' },
    });
    return { cierre, movimientos };
  }

  private async recalcularCierre(manager: EntityManager, cierre: CierreCaja): Promise<void> {
    const vigentes = await manager.find(MovimientoCaja, { where: { cierreId: cierre.id } });
    cierre.aplicarTotales(vigentes);
    await manager.save(cierre);
  }
}
