import { CierreCaja } from '../../caja/modelo/cierre-caja.entity';
import {
  MovimientoCaja,
  MedioPago,
  TipoMovimientoCaja,
} from '../../caja/modelo/movimiento-caja.entity';

describe('CierreCaja', () => {
  describe('crear', () => {
    it('crea un cierre con los totales correctos', () => {
      const movs = [
        MovimientoCaja.crear(1000, undefined, MedioPago.EFECTIVO),
        MovimientoCaja.crear(2000, undefined, MedioPago.TARJETA),
        MovimientoCaja.crear(500, 'Retiro', undefined, undefined, TipoMovimientoCaja.RETIRO),
      ];
      const cierre = CierreCaja.crear('2026-08-20', movs);
      expect(cierre.fecha).toBe('2026-08-20');
      expect(cierre.montoTotal).toBe(2500);
      expect(cierre.montoEfectivo).toBe(500);
      expect(cierre.montoTarjeta).toBe(2000);
      expect(cierre.montoTransferencia).toBe(0);
      expect(cierre.montoOtro).toBe(0);
    });
  });

  describe('aplicarTotales', () => {
    it('calcula totales desde movimientos', () => {
      const cierre = new CierreCaja();
      const movs = [
        MovimientoCaja.crear(5000, undefined, MedioPago.EFECTIVO),
        MovimientoCaja.crear(3000, undefined, MedioPago.TRANSFERENCIA),
      ];
      cierre.aplicarTotales(movs);
      expect(cierre.montoTotal).toBe(8000);
      expect(cierre.montoEfectivo).toBe(5000);
      expect(cierre.montoTransferencia).toBe(3000);
      expect(cierre.montoTarjeta).toBe(0);
      expect(cierre.montoOtro).toBe(0);
    });

    it('recalcula correctamente al agregar movimientos', () => {
      const cierre = new CierreCaja();
      const movs1 = [MovimientoCaja.crear(1000)];
      cierre.aplicarTotales(movs1);
      expect(cierre.montoTotal).toBe(1000);

      const movs2 = [MovimientoCaja.crear(1000), MovimientoCaja.crear(2000, undefined, MedioPago.TARJETA)];
      cierre.aplicarTotales(movs2);
      expect(cierre.montoTotal).toBe(3000);
      expect(cierre.montoTarjeta).toBe(2000);
    });
  });
});
