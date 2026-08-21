import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { FacturacionController } from '../../facturacion/controlador/facturacion.controller';
import { FacturacionGestor } from '../../facturacion/gestor/facturacion.gestor';

const ID_COMPROBANTE = 'aaaaaaaa-bbbb-4ccc-dedd-eeeeeeeeeee4';

const dtoFacturaValida = {
  tipo: 'B',
  receptor: { docTipo: 99, docNro: 0 },
  items: [
    {
      descripcion: 'Tornillo 1/4',
      cantidad: 10,
      precioUnitario: 50,
      ivaPorcentaje: 21,
      unidadMedida: 7,
    },
  ],
  condicionVenta: 'CONTADO',
};

describe('FacturacionController (integration)', () => {
  let app: INestApplication;

  const mockFacturacionGestor = {
    emitirFactura: jest.fn(),
    listarPorEmisor: jest.fn(),
    anularFactura: jest.fn(),
    generarPdf: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturacionController],
      providers: [{ provide: FacturacionGestor, useValue: mockFacturacionGestor }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/facturacion/facturas', () => {
    it('emite una factura y retorna el comprobante con CAE', async () => {
      const comprobante = {
        id: ID_COMPROBANTE,
        tipoComprobante: 6,
        puntoVenta: 1,
        numero: 4,
        cae: '12345678901234',
        importeTotal: 605,
      };
      mockFacturacionGestor.emitirFactura.mockResolvedValue(comprobante);

      const res = await request(app.getHttpServer())
        .post('/api/facturacion/facturas')
        .send(dtoFacturaValida)
        .expect(201);

      expect(res.body.cae).toBe('12345678901234');
      expect(res.body.importeTotal).toBe(605);
      expect(mockFacturacionGestor.emitirFactura).toHaveBeenCalledWith(
        dtoFacturaValida,
      );
    });

    it('rechaza un body sin condición de venta (400)', async () => {
      const { condicionVenta: _omitida, ...sinCondicion } = dtoFacturaValida;

      await request(app.getHttpServer())
        .post('/api/facturacion/facturas')
        .send(sinCondicion)
        .expect(400);

      expect(mockFacturacionGestor.emitirFactura).not.toHaveBeenCalled();
    });

    it('rechaza una alícuota de IVA no permitida (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/facturacion/facturas')
        .send({
          ...dtoFacturaValida,
          items: [
            { ...dtoFacturaValida.items[0], ivaPorcentaje: 27 },
          ],
        })
        .expect(400);
    });
  });

  describe('GET /api/facturacion/facturas', () => {
    it('retorna el listado de comprobantes emitidos', async () => {
      const comprobante = { id: ID_COMPROBANTE, cae: '12345678901234' };
      mockFacturacionGestor.listarPorEmisor.mockResolvedValue([comprobante]);

      const res = await request(app.getHttpServer())
        .get('/api/facturacion/facturas')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].cae).toBe('12345678901234');
    });
  });

  describe('POST /api/facturacion/facturas/:id/nota-credito', () => {
    it('anula el comprobante emitiendo la Nota de Crédito', async () => {
      const notaCredito = {
        id: 'aaaaaaaa-bbbb-4ccc-dedd-eeeeeeeeeee9',
        tipoComprobante: 8,
        comprobanteOriginalId: ID_COMPROBANTE,
      };
      mockFacturacionGestor.anularFactura.mockResolvedValue(notaCredito);

      const res = await request(app.getHttpServer())
        .post(`/api/facturacion/facturas/${ID_COMPROBANTE}/nota-credito`)
        .expect(201);

      expect(res.body.tipoComprobante).toBe(8);
      expect(res.body.comprobanteOriginalId).toBe(ID_COMPROBANTE);
      expect(mockFacturacionGestor.anularFactura).toHaveBeenCalledWith(
        ID_COMPROBANTE,
      );
    });

    it('rechaza un id inválido (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/facturacion/facturas/no-es-un-uuid/nota-credito')
        .expect(400);

      expect(mockFacturacionGestor.anularFactura).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/facturacion/facturas/:id/pdf', () => {
    it('retorna el PDF del comprobante', async () => {
      mockFacturacionGestor.generarPdf.mockResolvedValue({
        buffer: Buffer.from('%PDF-factura-de-prueba'),
        nombreArchivo: 'comprobante-B-0001-00000004.pdf',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/facturacion/facturas/${ID_COMPROBANTE}/pdf`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(mockFacturacionGestor.generarPdf).toHaveBeenCalledWith(
        ID_COMPROBANTE,
      );
    });
  });
});
