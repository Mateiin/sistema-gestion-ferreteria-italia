import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { VentasController } from '../../ventas/controlador/ventas.controller';
import { VentasGestor } from '../../ventas/gestor/ventas.gestor';
import { EstadoVenta, Venta } from '../../ventas/modelo/venta.entity';
import { LineaVenta } from '../../ventas/modelo/linea-venta.entity';
import { Cliente, CondicionIvaCliente } from '../../ventas/modelo/cliente.entity';

const ID_CLIENTE = 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeee1';
const ID_VENTA = 'aaaaaaaa-bbbb-4ccc-bedd-eeeeeeeeeee2';
const ID_LINEA = 'aaaaaaaa-bbbb-4ccc-cedd-eeeeeeeeeee3';
const ID_COMPROBANTE = 'aaaaaaaa-bbbb-4ccc-dedd-eeeeeeeeeee4';

function crearLinea(overrides: Partial<LineaVenta> = {}): LineaVenta {
  return Object.assign(new LineaVenta(), {
    id: ID_LINEA,
    ventaId: ID_VENTA,
    descripcion: 'Tornillo 1/4',
    cantidad: 10,
    precioUnitario: 50,
    ivaPorcentaje: 21,
    unidadMedida: 7,
    ...overrides,
  });
}

const mockCliente: Cliente = Object.assign(new Cliente(), {
  id: ID_CLIENTE,
  razonSocial: 'Test Cliente',
  docTipo: 99,
  docNro: 0,
  condicionIva: CondicionIvaCliente.CONSUMIDOR_FINAL,
});

function crearVenta(lineas: LineaVenta[] = []): Venta {
  return Object.assign(new Venta(), {
    id: ID_VENTA,
    clienteId: mockCliente.id,
    cliente: mockCliente,
    estado: EstadoVenta.ABIERTA,
    lineas,
    total() {
      return lineas.reduce((acc, l) => acc + l.cantidad * l.precioUnitario, 0);
    },
  });
}

describe('VentasController (integration)', () => {
  let app: INestApplication;

  const mockVentasGestor = {
    abrirFicha: jest.fn(),
    listarAbiertas: jest.fn(),
    obtener: jest.fn(),
    agregarLinea: jest.fn(),
    quitarLinea: jest.fn(),
    vaciarLineas: jest.fn(),
    generarPresupuesto: jest.fn(),
    facturarFicha: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VentasController],
      providers: [
        { provide: VentasGestor, useValue: mockVentasGestor },
      ],
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

  describe('POST /api/ventas/abrir', () => {
    it('abre una ficha y retorna con total', async () => {
      const venta = crearVenta([crearLinea()]);
      mockVentasGestor.abrirFicha.mockResolvedValue(venta);

      const res = await request(app.getHttpServer())
        .post('/api/ventas/abrir')
        .send({ clienteId: mockCliente.id });

      expect(res.status).toBe(201);

      expect(res.body.id).toBe(venta.id);
      expect(res.body.total).toBe(500);
      expect(mockVentasGestor.abrirFicha).toHaveBeenCalledWith(mockCliente.id);
    });
  });

  describe('GET /api/ventas/abiertas', () => {
    it('retorna fichas abiertas con total', async () => {
      const venta = crearVenta([crearLinea()]);
      mockVentasGestor.listarAbiertas.mockResolvedValue([venta]);

      const res = await request(app.getHttpServer())
        .get('/api/ventas/abiertas')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].total).toBe(500);
    });
  });

  describe('GET /api/ventas/:id', () => {
    it('retorna una ficha por id', async () => {
      const venta = crearVenta([crearLinea()]);
      mockVentasGestor.obtener.mockResolvedValue(venta);

      const res = await request(app.getHttpServer())
        .get(`/api/ventas/${venta.id}`)
        .expect(200);

      expect(res.body.id).toBe(venta.id);
    });
  });

  describe('POST /api/ventas/:id/lineas', () => {
    it('agrega una línea a la ficha', async () => {
      const venta = crearVenta([crearLinea()]);
      mockVentasGestor.agregarLinea.mockResolvedValue(venta);

      const res = await request(app.getHttpServer())
        .post(`/api/ventas/${venta.id}/lineas`)
        .send({
          descripcion: 'Tornillo 1/4',
          cantidad: 10,
          precioUnitario: 50,
          ivaPorcentaje: 21,
        })
        .expect(201);

      expect(res.body.total).toBe(500);
      expect(mockVentasGestor.agregarLinea).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/ventas/:id/lineas', () => {
    it('vacía las líneas de la ficha', async () => {
      const ventaVacia = crearVenta([]);
      mockVentasGestor.vaciarLineas.mockResolvedValue(ventaVacia);

      const res = await request(app.getHttpServer())
        .delete(`/api/ventas/${ventaVacia.id}/lineas`)
        .expect(200);

      expect(res.body.total).toBe(0);
    });
  });

  describe('DELETE /api/ventas/:id/lineas/:lineaId', () => {
    it('quita una línea puntual de la ficha', async () => {
      const venta = crearVenta([crearLinea()]);
      mockVentasGestor.quitarLinea.mockResolvedValue(venta);

      const res = await request(app.getHttpServer())
        .delete(`/api/ventas/${ID_VENTA}/lineas/${ID_LINEA}`)
        .expect(200);

      expect(res.body.total).toBe(500);
      expect(mockVentasGestor.quitarLinea).toHaveBeenCalledWith(
        ID_VENTA,
        ID_LINEA,
      );
    });
  });

  describe('POST /api/ventas/:id/presupuesto', () => {
    it('retorna el PDF del presupuesto', async () => {
      mockVentasGestor.generarPresupuesto.mockResolvedValue({
        buffer: Buffer.from('%PDF-presupuesto-de-prueba'),
        nombreArchivo: 'presupuesto.pdf',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/ventas/${ID_VENTA}/presupuesto`)
        .expect(201);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(mockVentasGestor.generarPresupuesto).toHaveBeenCalledWith(
        ID_VENTA,
      );
    });
  });

  describe('POST /api/ventas/:id/facturar', () => {
    it('emite la ficha y retorna el comprobante', async () => {
      const comprobante = {
        id: ID_COMPROBANTE,
        tipoComprobante: 6,
        cae: '12345678901234',
        importeTotal: 500,
      };
      mockVentasGestor.facturarFicha.mockResolvedValue(comprobante);

      const res = await request(app.getHttpServer())
        .post(`/api/ventas/${ID_VENTA}/facturar`)
        .send({ condicionVenta: 'CONTADO' })
        .expect(201);

      expect(res.body.cae).toBe('12345678901234');
      expect(res.body.importeTotal).toBe(500);
      expect(mockVentasGestor.facturarFicha).toHaveBeenCalledWith(
        ID_VENTA,
        'CONTADO',
      );
    });
  });

  describe('validaciones de DTO', () => {
    it('rechaza abrir ficha con clienteId inválido (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/ventas/abrir')
        .send({ clienteId: 'no-es-un-uuid' })
        .expect(400);

      expect(mockVentasGestor.abrirFicha).not.toHaveBeenCalled();
    });

    it('rechaza id de venta inválido en la ruta (400)', async () => {
      await request(app.getHttpServer())
        .get('/api/ventas/no-es-un-uuid')
        .expect(400);
    });
  });
});
