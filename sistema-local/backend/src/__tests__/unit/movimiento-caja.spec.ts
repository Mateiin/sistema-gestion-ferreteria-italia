import {
  MovimientoCaja,
  MedioPago,
  TipoMovimientoCaja,
} from '../../caja/modelo/movimiento-caja.entity';

describe('MovimientoCaja', () => {
  describe('crear', () => {
    it('crea una venta con valores por defecto', () => {
      const mov = MovimientoCaja.crear(1500, 'Venta de tornillos');
      expect(mov.monto).toBe(1500);
      expect(mov.descripcion).toBe('Venta de tornillos');
      expect(mov.tipo).toBe(TipoMovimientoCaja.VENTA);
      expect(mov.medioPago).toBe(MedioPago.EFECTIVO);
      expect(mov.cierreId).toBeNull();
      expect(mov.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('respeta medio de pago explícito', () => {
      const mov = MovimientoCaja.crear(2000, undefined, MedioPago.TARJETA);
      expect(mov.medioPago).toBe(MedioPago.TARJETA);
    });

    it('un RETIRO siempre es EFECTIVO sin importar el medio ingresado', () => {
      const mov = MovimientoCaja.crear(500, 'Retiro', MedioPago.TARJETA, undefined, TipoMovimientoCaja.RETIRO);
      expect(mov.tipo).toBe(TipoMovimientoCaja.RETIRO);
      expect(mov.medioPago).toBe(MedioPago.EFECTIVO);
    });

    it('respeta fecha explícita', () => {
      const mov = MovimientoCaja.crear(1000, undefined, undefined, '2026-01-15');
      expect(mov.fecha).toBe('2026-01-15');
    });
  });

  describe('calcularTotal', () => {
    it('devuelve 0 para array vacío', () => {
      expect(MovimientoCaja.calcularTotal([])).toBe(0);
    });

    it('suma solo ventas', () => {
      const movs = [
        MovimientoCaja.crear(1000),
        MovimientoCaja.crear(2000, undefined, MedioPago.TARJETA),
      ];
      expect(MovimientoCaja.calcularTotal(movs)).toBe(3000);
    });

    it('resta retiros', () => {
      const movs = [
        MovimientoCaja.crear(5000),
        MovimientoCaja.crear(1000, 'Retiro', undefined, undefined, TipoMovimientoCaja.RETIRO),
      ];
      expect(MovimientoCaja.calcularTotal(movs)).toBe(4000);
    });

    it('mezcla ventas y retiros', () => {
      const movs = [
        MovimientoCaja.crear(3000),
        MovimientoCaja.crear(2000, undefined, MedioPago.TRANSFERENCIA),
        MovimientoCaja.crear(500, 'Retiro', undefined, undefined, TipoMovimientoCaja.RETIRO),
      ];
      expect(MovimientoCaja.calcularTotal(movs)).toBe(4500);
    });
  });

  describe('calcularPorMedioPago', () => {
    it('devuelve ceros para array vacío', () => {
      const totales = MovimientoCaja.calcularPorMedioPago([]);
      expect(totales[MedioPago.EFECTIVO]).toBe(0);
      expect(totales[MedioPago.TRANSFERENCIA]).toBe(0);
      expect(totales[MedioPago.TARJETA]).toBe(0);
      expect(totales[MedioPago.OTRO]).toBe(0);
    });

    it('agrupa por medio de pago', () => {
      const movs = [
        MovimientoCaja.crear(1000, undefined, MedioPago.EFECTIVO),
        MovimientoCaja.crear(2000, undefined, MedioPago.TARJETA),
        MovimientoCaja.crear(500, undefined, MedioPago.EFECTIVO),
      ];
      const totales = MovimientoCaja.calcularPorMedioPago(movs);
      expect(totales[MedioPago.EFECTIVO]).toBe(1500);
      expect(totales[MedioPago.TARJETA]).toBe(2000);
      expect(totales[MedioPago.TRANSFERENCIA]).toBe(0);
    });

    it('retiros restan de EFECTIVO', () => {
      const movs = [
        MovimientoCaja.crear(3000, undefined, MedioPago.EFECTIVO),
        MovimientoCaja.crear(1000, 'Retiro', undefined, undefined, TipoMovimientoCaja.RETIRO),
      ];
      const totales = MovimientoCaja.calcularPorMedioPago(movs);
      expect(totales[MedioPago.EFECTIVO]).toBe(2000);
    });
  });
});
