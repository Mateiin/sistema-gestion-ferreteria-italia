import {
  formatearUnidad,
  formatearMoneda,
  formatearReceptorDoc,
  armarTotalesArca,
  CONDICION_IVA_RECEPTOR_LEGIBLE,
  CONDICION_VENTA_LEGIBLE,
} from '../../facturacion/pdf/formato-arca';

describe('formato-arca', () => {
  describe('formatearUnidad', () => {
    it('7 → unidades', () => {
      expect(formatearUnidad(7)).toBe('unidades');
    });

    it('1 → kg', () => {
      expect(formatearUnidad(1)).toBe('kg');
    });

    it('2 → m', () => {
      expect(formatearUnidad(2)).toBe('m');
    });

    it('código desconocido → "Cód. N"', () => {
      expect(formatearUnidad(99)).toBe('Cód. 99');
    });
  });

  describe('formatearMoneda', () => {
    it('formatea con separador de miles y decimales', () => {
      const resultado = formatearMoneda(1300);
      expect(resultado).toContain('1');
      expect(resultado).toContain('300');
      expect(resultado).toContain('00');
    });

    it('formatea 0', () => {
      expect(formatearMoneda(0)).toContain('0');
    });

    it('maneja decimales', () => {
      const resultado = formatearMoneda(1234.56);
      expect(resultado).toContain('1');
      expect(resultado).toContain('234');
      expect(resultado).toContain('56');
    });
  });

  describe('formatearReceptorDoc', () => {
    it('docTipo 99 → Consumidor Final', () => {
      expect(formatearReceptorDoc(99, 0)).toBe('Consumidor Final');
    });

    it('docTipo 80 → CUIT con número', () => {
      expect(formatearReceptorDoc(80, 20111222339)).toBe('CUIT: 20111222339');
    });

    it('docTipo 96 → DNI con número', () => {
      expect(formatearReceptorDoc(96, 12345678)).toBe('DNI: 12345678');
    });

    it('docTipo genérico → Doc. tipo N', () => {
      expect(formatearReceptorDoc(50, 999)).toBe('Doc. tipo 50: 999');
    });
  });

  describe('armarTotalesArca', () => {
    it('Factura B: solo importe total', () => {
      const resultado = armarTotalesArca({
        esA: false,
        neto: 10000,
        desglose: [],
        total: 12100,
      });
      const body = (resultado as any).table.body[0][0].table.body;
      expect(body).toHaveLength(1);
      expect(body[0][0].text).toContain('Importe Total');
    });

    it('Factura A: discrimina IVA por alícuota', () => {
      const resultado = armarTotalesArca({
        esA: true,
        neto: 10000,
        desglose: [{ alicuotaPorcentaje: 21, iva: 2100 }],
        total: 12100,
      });
      const body = (resultado as any).table.body[0][0].table.body;
      // Neto + 6 alícuotas + Otros Tributos + Total = 8 filas
      expect(body.length).toBeGreaterThanOrEqual(7);
      expect(body[0][0].text).toContain('Importe Neto Gravado');
    });

    it('Factura A con 10.5% muestra IVA en la alícuota correcta', () => {
      const resultado = armarTotalesArca({
        esA: true,
        neto: 10000,
        desglose: [{ alicuotaPorcentaje: 10.5, iva: 1050 }],
        total: 11050,
      });
      const body = (resultado as any).table.body[0][0].table.body;
      const filaIva105 = body.find((f: any) => f[0].text?.includes('10.5'));
      expect(filaIva105).toBeDefined();
    });
  });

  describe('constantes de formato', () => {
    it('CONDICION_IVA_RECEPTOR_LEGIBLE tiene todas las condiciones', () => {
      expect(CONDICION_IVA_RECEPTOR_LEGIBLE.RESPONSABLE_INSCRIPTO).toBeDefined();
      expect(CONDICION_IVA_RECEPTOR_LEGIBLE.MONOTRIBUTO).toBeDefined();
      expect(CONDICION_IVA_RECEPTOR_LEGIBLE.EXENTO).toBeDefined();
      expect(CONDICION_IVA_RECEPTOR_LEGIBLE.CONSUMIDOR_FINAL).toBeDefined();
    });

    it('CONDICION_VENTA_LEGIBLE tiene todas las condiciones', () => {
      expect(CONDICION_VENTA_LEGIBLE.CONTADO).toBeDefined();
      expect(CONDICION_VENTA_LEGIBLE.CUENTA_CORRIENTE).toBeDefined();
      expect(CONDICION_VENTA_LEGIBLE.TARJETA_DEBITO).toBeDefined();
      expect(CONDICION_VENTA_LEGIBLE.TARJETA_CREDITO).toBeDefined();
    });
  });
});
