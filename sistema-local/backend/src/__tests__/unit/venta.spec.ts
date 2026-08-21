import {
  Venta,
  EstadoVenta,
  FichaNoAbiertaError,
  FichaSinLineasError,
} from '../../ventas/modelo/venta.entity';
import { LineaVenta } from '../../ventas/modelo/linea-venta.entity';

function crearLinea(cantidad: number, precioUnitario: number): LineaVenta {
  const linea = new LineaVenta();
  linea.cantidad = cantidad;
  linea.precioUnitario = precioUnitario;
  return linea;
}

describe('Venta', () => {
  describe('total', () => {
    it('devuelve 0 si no tiene líneas', () => {
      const venta = new Venta();
      venta.lineas = [];
      expect(venta.total()).toBe(0);
    });

    it('devuelve 0 si lineas es undefined', () => {
      const venta = new Venta();
      venta.lineas = undefined as any;
      expect(venta.total()).toBe(0);
    });

    it('suma una sola línea', () => {
      const venta = new Venta();
      venta.lineas = [crearLinea(2, 1000)];
      expect(venta.total()).toBe(2000);
    });

    it('suma múltiples líneas', () => {
      const venta = new Venta();
      venta.lineas = [crearLinea(1, 5000), crearLinea(3, 1000)];
      expect(venta.total()).toBe(8000);
    });

    it('redondea el resultado final', () => {
      const venta = new Venta();
      venta.lineas = [crearLinea(3, 100.01)];
      expect(venta.total()).toBeCloseTo(300.03, 2);
    });

    it('maneja cantidades como string (numeric de Postgres)', () => {
      const venta = new Venta();
      const linea = new LineaVenta();
      linea.cantidad = '2' as any;
      linea.precioUnitario = '1500' as any;
      venta.lineas = [linea];
      expect(venta.total()).toBe(3000);
    });
  });

  describe('validarPuedeFacturar', () => {
    it('no tira error si está ABIERTA con líneas', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.ABIERTA;
      venta.lineas = [crearLinea(1, 1000)];
      expect(() => venta.validarPuedeFacturar()).not.toThrow();
    });

    it('tira FichaNoAbiertaError si está EMITIDA', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.EMITIDA;
      venta.lineas = [crearLinea(1, 1000)];
      expect(() => venta.validarPuedeFacturar()).toThrow(FichaNoAbiertaError);
    });

    it('tira FichaNoAbiertaError si está ANULADA', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.ANULADA;
      venta.lineas = [crearLinea(1, 1000)];
      expect(() => venta.validarPuedeFacturar()).toThrow(FichaNoAbiertaError);
    });

    it('tira FichaSinLineasError si está ABIERTA sin líneas', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.ABIERTA;
      venta.lineas = [];
      expect(() => venta.validarPuedeFacturar()).toThrow(FichaSinLineasError);
    });

    it('tira FichaSinLineasError si lineas es undefined', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.ABIERTA;
      venta.lineas = undefined as any;
      expect(() => venta.validarPuedeFacturar()).toThrow(FichaSinLineasError);
    });
  });

  describe('marcarEmitida', () => {
    it('cambia estado y guarda comprobanteId', () => {
      const venta = new Venta();
      venta.estado = EstadoVenta.ABIERTA;
      venta.marcarEmitida('comprobante-uuid');
      expect(venta.estado).toBe(EstadoVenta.EMITIDA);
      expect(venta.comprobanteId).toBe('comprobante-uuid');
    });
  });
});
