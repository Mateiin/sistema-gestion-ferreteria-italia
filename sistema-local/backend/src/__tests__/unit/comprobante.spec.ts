import {
  Comprobante,
  ComprobanteYaAnuladoError,
  SinDesgloseIvaError,
  ItemCargado,
} from '../../facturacion/modelo/comprobante.entity';
import { TipoFacturaDominio } from '../../facturacion/interfaces/arca-provider.interface';

describe('Comprobante', () => {
  describe('calcularImportesLinea', () => {
    it('calcula neto e IVA para una línea con 21%', () => {
      const resultado = Comprobante.calcularImportesLinea(2, 1000, 21);
      expect(resultado.neto).toBe(2000);
      expect(resultado.iva).toBe(420);
    });

    it('calcula neto e IVA para 10.5%', () => {
      const resultado = Comprobante.calcularImportesLinea(1, 5000, 10.5);
      expect(resultado.neto).toBe(5000);
      expect(resultado.iva).toBe(525);
    });

    it('calcula IVA 0%', () => {
      const resultado = Comprobante.calcularImportesLinea(10, 100, 0);
      expect(resultado.neto).toBe(1000);
      expect(resultado.iva).toBe(0);
    });

    it('no redondea por línea (acumula para agrupar después)', () => {
      const resultado = Comprobante.calcularImportesLinea(3, 100.01, 21);
      expect(resultado.neto).toBeCloseTo(300.03, 10);
      expect(resultado.iva).toBeCloseTo(63.0063, 10);
    });

    it('maneja cantidad fraccionaria', () => {
      const resultado = Comprobante.calcularImportesLinea(0.5, 200, 21);
      expect(resultado.neto).toBe(100);
      expect(resultado.iva).toBe(21);
    });
  });

  describe('calcularDesglose', () => {
    it('agrupa un solo ítem', () => {
      const items: ItemCargado[] = [{ cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 21 }];
      const desglose = Comprobante.calcularDesglose(items);
      expect(desglose).toHaveLength(1);
      expect(desglose[0]).toEqual({ alicuotaPorcentaje: 21, neto: 10000, iva: 2100 });
    });

    it('agrupa dos ítems con la misma alícuota', () => {
      const items: ItemCargado[] = [
        { cantidad: 1, precioUnitario: 5000, ivaPorcentaje: 21 },
        { cantidad: 2, precioUnitario: 3000, ivaPorcentaje: 21 },
      ];
      const desglose = Comprobante.calcularDesglose(items);
      expect(desglose).toHaveLength(1);
      expect(desglose[0].neto).toBe(11000);
      expect(desglose[0].iva).toBe(2310);
    });

    it('agrupa ítems con alícuotas distintas (21% y 10.5%)', () => {
      const items: ItemCargado[] = [
        { cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 21 },
        { cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 10.5 },
      ];
      const desglose = Comprobante.calcularDesglose(items);
      expect(desglose).toHaveLength(2);
      const a21 = desglose.find((d) => d.alicuotaPorcentaje === 21)!;
      const a105 = desglose.find((d) => d.alicuotaPorcentaje === 10.5)!;
      expect(a21.neto).toBe(10000);
      expect(a21.iva).toBe(2100);
      expect(a105.neto).toBe(10000);
      expect(a105.iva).toBe(1050);
    });

    it('usa IVA 21% por defecto cuando ivaPorcentaje no viene', () => {
      const items: ItemCargado[] = [{ cantidad: 1, precioUnitario: 1000 }];
      const desglose = Comprobante.calcularDesglose(items);
      expect(desglose[0].alicuotaPorcentaje).toBe(21);
      expect(desglose[0].iva).toBe(210);
    });

    it('redondea por alícuota, no por línea', () => {
      const items: ItemCargado[] = [
        { cantidad: 3, precioUnitario: 100.01, ivaPorcentaje: 21 },
      ];
      const desglose = Comprobante.calcularDesglose(items);
      expect(desglose[0].neto).toBe(300.03);
      // 300.03 * 0.21 = 63.0063 → redondeado = 63.01
      expect(desglose[0].iva).toBe(63.01);
    });

    it('devuelve array vacío para items vacío', () => {
      expect(Comprobante.calcularDesglose([])).toEqual([]);
    });
  });

  describe('totalizar', () => {
    it('suma neto e IVA de un solo grupo', () => {
      const desglose = [{ alicuotaPorcentaje: 21, neto: 10000, iva: 2100 }];
      const total = Comprobante.totalizar(desglose);
      expect(total).toEqual({
        importeNeto: 10000,
        importeIva: 2100,
        importeTotal: 12100,
      });
    });

    it('suma neto e IVA de múltiples grupos', () => {
      const desglose = [
        { alicuotaPorcentaje: 21, neto: 10000, iva: 2100 },
        { alicuotaPorcentaje: 10.5, neto: 10000, iva: 1050 },
      ];
      const total = Comprobante.totalizar(desglose);
      expect(total.importeNeto).toBe(20000);
      expect(total.importeIva).toBe(3150);
      expect(total.importeTotal).toBe(23150);
    });

    it('maneja precisiones de punto flotante', () => {
      const desglose = [{ alicuotaPorcentaje: 21, neto: 300.03, iva: 63.01 }];
      const total = Comprobante.totalizar(desglose);
      expect(total.importeNeto).toBe(300.03);
      expect(total.importeIva).toBe(63.01);
      expect(total.importeTotal).toBe(363.04);
    });

    it('devuelve ceros para desglose vacío', () => {
      const total = Comprobante.totalizar([]);
      expect(total).toEqual({ importeNeto: 0, importeIva: 0, importeTotal: 0 });
    });
  });

  describe('condicionIvaRequerida', () => {
    it('Factura A con condición explícita la devuelve', () => {
      expect(
        Comprobante.condicionIvaRequerida('A', 'RESPONSABLE_INSCRIPTO'),
      ).toBe('RESPONSABLE_INSCRIPTO');
    });

    it('Factura A sin condición devuelve RESPONSABLE_INSCRIPTO por defecto', () => {
      expect(Comprobante.condicionIvaRequerida('A')).toBe('RESPONSABLE_INSCRIPTO');
    });

    it('Factura B devuelve undefined', () => {
      expect(Comprobante.condicionIvaRequerida('B')).toBeUndefined();
    });

    it('Factura B ignora condición solicitada', () => {
      expect(Comprobante.condicionIvaRequerida('B', 'MONOTRIBUTO')).toBeUndefined();
    });
  });

  describe('armarDetalle', () => {
    it('arma snapshot de ítems con valores por defecto', () => {
      const items = [{ descripcion: 'Tornillo', cantidad: 10, precioUnitario: 50 }];
      const detalle = Comprobante.armarDetalle(items);
      expect(detalle).toHaveLength(1);
      expect(detalle[0]).toEqual({
        descripcion: 'Tornillo',
        cantidad: 10,
        precioUnitario: 50,
        ivaPorcentaje: 21,
        subtotalNeto: 500,
        unidadMedida: 7,
      });
    });

    it('respeta valores explícitos de IVA y unidad de medida', () => {
      const items = [
        {
          descripcion: 'Caño',
          cantidad: 2,
          precioUnitario: 1000,
          ivaPorcentaje: 10.5,
          unidadMedida: 2,
        },
      ];
      const detalle = Comprobante.armarDetalle(items);
      expect(detalle[0].ivaPorcentaje).toBe(10.5);
      expect(detalle[0].unidadMedida).toBe(2);
      expect(detalle[0].subtotalNeto).toBe(2000);
    });
  });

  describe('letra / tipoDocumentoTexto / nombreArchivoPdf', () => {
    const casos = [
      { tipo: 1, letra: 'A', nombre: 'Factura A' },
      { tipo: 6, letra: 'B', nombre: 'Factura B' },
      { tipo: 11, letra: 'C', nombre: 'Factura C' },
      { tipo: 3, letra: 'A', nombre: 'Nota de Crédito A' },
      { tipo: 8, letra: 'B', nombre: 'Nota de Crédito B' },
    ];

    for (const caso of casos) {
      it(`tipo ${caso.tipo} → letra ${caso.letra}`, () => {
        const c = new Comprobante();
        c.tipoComprobante = caso.tipo;
        expect(c.letra()).toBe(caso.letra);
        expect(c.tipoDocumentoTexto()).toBe(caso.nombre);
      });
    }

    it('tipo desconocido devuelve ?', () => {
      const c = new Comprobante();
      c.tipoComprobante = 99;
      expect(c.letra()).toBe('?');
    });

    it('nombreArchivoPdf formatea correctamente', () => {
      const c = new Comprobante();
      c.tipoComprobante = 6;
      c.puntoVenta = 1;
      c.numero = 4;
      expect(c.nombreArchivoPdf()).toBe('comprobante-B-0001-00000004.pdf');
    });
  });

  describe('crearAutorizado', () => {
    it('arma comprobante con todos los campos', () => {
      const desglose = [{ alicuotaPorcentaje: 21, neto: 10000, iva: 2100 }];
      const resultado = {
        cae: '12345678901234',
        fecha: '20260815',
        vencimientoCae: '20260825',
        numeroComprobante: 1,
      };
      const comprobante = Comprobante.crearAutorizado(
        {
          emisorId: 'emisor-1',
          tipoComprobante: 6,
          puntoVenta: 1,
          docTipoReceptor: 99,
          docNroReceptor: 0,
          condicionVenta: 'CONTADO',
          razonSocialReceptor: 'Test',
          domicilioReceptor: 'Dirección 123',
        },
        desglose,
        resultado,
      );
      expect(comprobante.emisorId).toBe('emisor-1');
      expect(comprobante.tipoComprobante).toBe(6);
      expect(comprobante.numero).toBe(1);
      expect(comprobante.fecha).toBe('2026-08-15');
      expect(comprobante.cae).toBe('12345678901234');
      expect(comprobante.importeNeto).toBe(10000);
      expect(comprobante.importeIva).toBe(2100);
      expect(comprobante.importeTotal).toBe(12100);
      expect(comprobante.razonSocialReceptor).toBe('Test');
      expect(comprobante.domicilioReceptor).toBe('Dirección 123');
    });
  });

  describe('construirUrlQr', () => {
    it('arma URL con payload base64 válido', () => {
      const c = new Comprobante();
      c.fecha = '2026-08-15';
      c.puntoVenta = 1;
      c.tipoComprobante = 6;
      c.numero = 1;
      c.importeTotal = 12100;
      c.docTipoReceptor = 99;
      c.docNroReceptor = 0;
      c.cae = '12345678901234';

      const emisor = { cuit: 20111222339 } as any;
      const url = Comprobante.construirUrlQr(c, emisor);
      expect(url).toContain('https://www.afip.gob.ar/fe/qr/?p=');
      const base64 = url.split('p=')[1];
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      expect(payload.ver).toBe(1);
      expect(payload.fecha).toBe('2026-08-15');
      expect(payload.cuit).toBe(20111222339);
      expect(payload.tipoCmp).toBe(6);
      expect(payload.nroCmp).toBe(1);
    });

    it('tira error si no hay fecha', () => {
      const c = new Comprobante();
      const emisor = { cuit: 20111222339 } as any;
      expect(() => Comprobante.construirUrlQr(c, emisor)).toThrow(
        'El comprobante no tiene fecha guardada',
      );
    });
  });

  describe('prepararNotaCredito', () => {
    it('prepara NC correctamente desde un comprobante autorizado', () => {
      const c = new Comprobante();
      c.estado = 'autorizado';
      c.tipoComprobante = 6;
      c.puntoVenta = 1;
      c.numero = 5;
      c.docTipoReceptor = 80;
      c.docNroReceptor = 20111222339;
      c.condicionIvaReceptor = 'RESPONSABLE_INSCRIPTO';
      c.ivaDesglose = [{ alicuotaPorcentaje: 21, neto: 10000, iva: 2100 }];

      const datos = c.prepararNotaCredito('A');
      expect(datos.tipoFactura).toBe('A');
      expect(datos.comprobanteAsociado).toEqual({
        tipoComprobante: 6,
        puntoVenta: 1,
        numero: 5,
      });
      expect(datos.importeNeto).toBe(10000);
    });

    it('tira error si ya está anulado', () => {
      const c = new Comprobante();
      c.estado = 'anulado';
      c.ivaDesglose = [{ alicuotaPorcentaje: 21, neto: 1000, iva: 210 }];
      expect(() => c.prepararNotaCredito('A')).toThrow(ComprobanteYaAnuladoError);
    });

    it('tira error si no tiene desglose IVA', () => {
      const c = new Comprobante();
      c.estado = 'autorizado';
      c.ivaDesglose = undefined;
      expect(() => c.prepararNotaCredito('A')).toThrow(SinDesgloseIvaError);
    });
  });

  describe('registrarNotaCredito', () => {
    it('marca original como anulado y crea NC con referencia', () => {
      const original = new Comprobante();
      original.id = 'uuid-original';
      original.emisorId = 'emisor-1';
      original.tipoComprobante = 6;
      original.puntoVenta = 1;
      original.numero = 5;
      original.docTipoReceptor = 99;
      original.docNroReceptor = 0;
      original.ivaDesglose = [{ alicuotaPorcentaje: 21, neto: 10000, iva: 2100 }];
      original.detalle = [];
      original.estado = 'autorizado';

      const resultado = {
        cae: 'NC-CAE-123',
        fecha: '20260815',
        vencimientoCae: '20260825',
        numeroComprobante: 1,
      };

      const nc = original.registrarNotaCredito(8, resultado);
      expect(original.estado).toBe('anulado');
      expect(nc.tipoComprobante).toBe(8);
      expect(nc.comprobanteOriginalId).toBe('uuid-original');
      expect(nc.cae).toBe('NC-CAE-123');
      expect(nc.ivaDesglose).toEqual(original.ivaDesglose);
    });
  });
});
