import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CajaController } from '../../caja/controlador/caja.controller';
import { CajaGestor } from '../../caja/gestor/caja.gestor';
import { MedioPago, MovimientoCaja, TipoMovimientoCaja } from '../../caja/modelo/movimiento-caja.entity';
import { CierreCaja } from '../../caja/modelo/cierre-caja.entity';

function crearMovimiento(overrides: Partial<MovimientoCaja> = {}): MovimientoCaja {
  return Object.assign(new MovimientoCaja(), {
    id: '00000000-0000-0000-0000-000000000010',
    fecha: '2026-08-20',
    monto: 1500,
    descripcion: 'Venta de tornillos',
    medioPago: MedioPago.EFECTIVO,
    tipo: TipoMovimientoCaja.VENTA,
    cierreId: null,
    ...overrides,
  });
}

describe('CajaController (integration)', () => {
  let app: INestApplication;

  const mockCajaGestor = {
    registrar: jest.fn(),
    obtenerDia: jest.fn(),
    borrar: jest.fn(),
    resumen: jest.fn(),
    cerrarDia: jest.fn(),
    listarCierres: jest.fn(),
    obtenerCierre: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CajaController],
      providers: [
        { provide: CajaGestor, useValue: mockCajaGestor },
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

  describe('POST /api/caja/movimientos', () => {
    it('registra un movimiento de venta', async () => {
      const mov = crearMovimiento();
      mockCajaGestor.registrar.mockResolvedValue(mov);

      const res = await request(app.getHttpServer())
        .post('/api/caja/movimientos')
        .send({ monto: 1500, descripcion: 'Venta de tornillos', medioPago: 'EFECTIVO' })
        .expect(201);

      expect(res.body.monto).toBe(1500);
      expect(res.body.medioPago).toBe('EFECTIVO');
    });
  });

  describe('GET /api/caja/dia', () => {
    it('retorna el día actual con movimientos y total', async () => {
      const movs = [crearMovimiento({ monto: 1000 }), crearMovimiento({ monto: 2000 })];
      mockCajaGestor.obtenerDia.mockResolvedValue({
        fecha: '2026-08-20',
        movimientos: movs,
        total: 3000,
        porMedioPago: {
          [MedioPago.EFECTIVO]: 3000,
          [MedioPago.TRANSFERENCIA]: 0,
          [MedioPago.TARJETA]: 0,
          [MedioPago.OTRO]: 0,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/caja/dia')
        .expect(200);

      expect(res.body.total).toBe(3000);
      expect(res.body.movimientos).toHaveLength(2);
    });
  });

  describe('DELETE /api/caja/movimientos/:id', () => {
    it('borra un movimiento', async () => {
      mockCajaGestor.borrar.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/api/caja/movimientos/00000000-0000-0000-0000-000000000010')
        .expect(200);

      expect(mockCajaGestor.borrar).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000010');
    });
  });

  describe('POST /api/caja/cierres', () => {
    it('cierra la caja del día', async () => {
      const cierre = Object.assign(new CierreCaja(), {
        id: 'cierre-1',
        fecha: '2026-08-20',
        montoTotal: 5000,
        montoEfectivo: 3000,
        montoTransferencia: 2000,
        montoTarjeta: 0,
        montoOtro: 0,
      });
      mockCajaGestor.cerrarDia.mockResolvedValue(cierre);

      const res = await request(app.getHttpServer())
        .post('/api/caja/cierres')
        .send({ fecha: '2026-08-20' })
        .expect(201);

      expect(res.body.montoTotal).toBe(5000);
    });
  });

  describe('GET /api/caja/cierres', () => {
    it('retorna listado de cierres', async () => {
      const cierre = Object.assign(new CierreCaja(), {
        id: 'cierre-1',
        fecha: '2026-08-20',
        montoTotal: 5000,
      });
      mockCajaGestor.listarCierres.mockResolvedValue([cierre]);

      const res = await request(app.getHttpServer())
        .get('/api/caja/cierres')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });
});
