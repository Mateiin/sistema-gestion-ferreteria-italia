import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ClientesController } from '../../ventas/controlador/clientes.controller';
import { ClientesGestor } from '../../ventas/gestor/clientes.gestor';
import { CuentaCorrienteGestor } from '../../ventas/gestor/cuenta-corriente.gestor';
import { Cliente, CondicionIvaCliente } from '../../ventas/modelo/cliente.entity';

const mockCliente: Cliente = Object.assign(new Cliente(), {
  id: '00000000-0000-0000-0000-000000000001',
  razonSocial: 'Cooperativa de Agua',
  docTipo: 80,
  docNro: 30712345678,
  condicionIva: CondicionIvaCliente.RESPONSABLE_INSCRIPTO,
  domicilio: 'Av. Siempre Viva 123',
  telefono: '299-1234567',
  email: 'coop@agua.com',
  activo: true,
});

describe('ClientesController (integration)', () => {
  let app: INestApplication;
  const mockClientesGestor = {
    crear: jest.fn().mockResolvedValue(mockCliente),
    buscar: jest.fn().mockResolvedValue([mockCliente]),
    obtener: jest.fn().mockResolvedValue(mockCliente),
    actualizar: jest.fn().mockResolvedValue({ ...mockCliente, razonSocial: 'Actualizado' }),
  };
  const mockCuentaCorrienteGestor = {
    listarConSaldo: jest.fn().mockResolvedValue([]),
    obtenerCuenta: jest.fn().mockResolvedValue({ cliente: mockCliente, movimientos: [], saldo: 0 }),
    registrarPago: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [
        { provide: ClientesGestor, useValue: mockClientesGestor },
        { provide: CuentaCorrienteGestor, useValue: mockCuentaCorrienteGestor },
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

  describe('POST /api/clientes', () => {
    it('crea un cliente y lo retorna', async () => {
      const dto = {
        razonSocial: 'Cooperativa de Agua',
        docTipo: 80,
        docNro: 30712345678,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
      };
      const res = await request(app.getHttpServer())
        .post('/api/clientes')
        .send(dto)
        .expect(201);

      expect(res.body.razonSocial).toBe('Cooperativa de Agua');
      expect(res.body.id).toBeDefined();
      expect(mockClientesGestor.crear).toHaveBeenCalledWith(dto);
    });
  });

  describe('GET /api/clientes', () => {
    it('retorna lista de clientes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clientes')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(mockClientesGestor.buscar).toHaveBeenCalledWith(undefined);
    });

    it('busca por nombre', async () => {
      await request(app.getHttpServer())
        .get('/api/clientes?nombre=Coop')
        .expect(200);

      expect(mockClientesGestor.buscar).toHaveBeenCalledWith('Coop');
    });
  });

  describe('GET /api/clientes/:id', () => {
    it('retorna un cliente por id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/clientes/${mockCliente.id}`)
        .expect(200);

      expect(res.body.id).toBe(mockCliente.id);
    });
  });

  describe('GET /api/clientes/con-saldo', () => {
    it('retorna lista (vacía en este mock)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clientes/con-saldo')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/clientes/:id/cuenta', () => {
    it('retorna cuenta corriente del cliente', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/clientes/${mockCliente.id}/cuenta`)
        .expect(200);

      expect(res.body.saldo).toBe(0);
    });
  });
});
