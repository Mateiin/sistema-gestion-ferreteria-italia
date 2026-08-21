import {
  MovimientoCtaCte,
  TipoMovimientoCtaCte,
} from '../../ventas/modelo/movimiento-cta-cte.entity';

describe('MovimientoCtaCte', () => {
  describe('crearCargo', () => {
    it('crea un cargo con los campos correctos', () => {
      const mov = MovimientoCtaCte.crearCargo('cli-1', 5000, 'comp-1');
      expect(mov.clienteId).toBe('cli-1');
      expect(mov.tipo).toBe(TipoMovimientoCtaCte.CARGO);
      expect(mov.monto).toBe(5000);
      expect(mov.comprobanteId).toBe('comp-1');
      expect(mov.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('crearPago', () => {
    it('crea un pago con los campos correctos', () => {
      const mov = MovimientoCtaCte.crearPago('cli-1', 2000, 'Efectivo');
      expect(mov.clienteId).toBe('cli-1');
      expect(mov.tipo).toBe(TipoMovimientoCtaCte.PAGO);
      expect(mov.monto).toBe(2000);
      expect(mov.descripcion).toBe('Efectivo');
      expect(mov.comprobanteId).toBeUndefined();
    });

    it('crea un pago sin descripción', () => {
      const mov = MovimientoCtaCte.crearPago('cli-1', 1000);
      expect(mov.descripcion).toBeUndefined();
    });
  });

  describe('calcularSaldo', () => {
    it('devuelve 0 para array vacío', () => {
      expect(MovimientoCtaCte.calcularSaldo([])).toBe(0);
    });

    it('saldo de un solo cargo', () => {
      const mov = MovimientoCtaCte.crearCargo('cli-1', 5000, 'c1');
      expect(MovimientoCtaCte.calcularSaldo([mov])).toBe(5000);
    });

    it('saldo de un solo pago', () => {
      const mov = MovimientoCtaCte.crearPago('cli-1', 3000);
      expect(MovimientoCtaCte.calcularSaldo([mov])).toBe(-3000);
    });

    it('saldo de cargos y pagos mixtos', () => {
      const cargo1 = MovimientoCtaCte.crearCargo('cli-1', 10000, 'c1');
      const cargo2 = MovimientoCtaCte.crearCargo('cli-1', 5000, 'c2');
      const pago = MovimientoCtaCte.crearPago('cli-1', 3000);
      expect(MovimientoCtaCte.calcularSaldo([cargo1, cargo2, pago])).toBe(12000);
    });

    it('redondea el resultado', () => {
      const movs = [
        { tipo: TipoMovimientoCtaCte.CARGO, monto: 100.01 } as any,
        { tipo: TipoMovimientoCtaCte.CARGO, monto: 200.02 } as any,
      ];
      expect(MovimientoCtaCte.calcularSaldo(movs)).toBe(300.03);
    });

    it('maneja montos como string (numeric de Postgres)', () => {
      const movs = [
        { tipo: TipoMovimientoCtaCte.CARGO, monto: '5000' } as any,
        { tipo: TipoMovimientoCtaCte.PAGO, monto: '2000' } as any,
      ];
      expect(MovimientoCtaCte.calcularSaldo(movs)).toBe(3000);
    });
  });
});
