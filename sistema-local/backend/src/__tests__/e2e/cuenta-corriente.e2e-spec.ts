import request from 'supertest';
import {
  abrirFicha,
  agregarLinea,
  crearAplicacionDePrueba,
  crearCliente,
  CLIENTE_CONSUMIDOR_FINAL,
  CLIENTE_RESPONSABLE_INSCRIPTO,
  facturar,
  AppPrueba,
} from './helpers/app-de-prueba';

/**
 * E2E de cuenta corriente: el CARGO nace de facturar la ficha en
 * CUENTA_CORRIENTE (mismo enganche que en producción), los PAGOS se registran
 * por su endpoint y el saldo se deriva de los movimientos.
 */
describe('Cuenta corriente (e2e)', () => {
  let app: AppPrueba;

  beforeAll(async () => {
    app = await crearAplicacionDePrueba();
  });

  afterAll(async () => {
    await app.app.close();
  });

  /** Cliente RI con una factura en CC emitida; devuelve cliente + comprobante */
  async function clienteConCargo() {
    const cliente = await crearCliente(app.app, CLIENTE_RESPONSABLE_INSCRIPTO);
    const ficha = await abrirFicha(app.app, cliente.id);
    await agregarLinea(app.app, ficha.id, {
      descripcion: 'Pintura látex 20L',
      cantidad: 3,
      precioUnitario: 25000,
    });
    const factura = await facturar(app.app, ficha.id, 'CUENTA_CORRIENTE').expect(201);
    return { cliente, factura };
  }

  it('cargo por factura CC → pago parcial → saldo e historial correctos', async () => {
    const { cliente, factura } = await clienteConCargo();

    const cuentaConCargo = await request(app.app.getHttpServer())
      .get(`/api/clientes/${cliente.id}/cuenta`)
      .expect(200);
    expect(cuentaConCargo.body.saldo).toBe(Number(factura.body.importeTotal));

    const pagoParcial = await request(app.app.getHttpServer())
      .post(`/api/clientes/${cliente.id}/pagos`)
      .send({ monto: 20000, descripcion: 'entrega en efectivo' })
      .expect(201);

    expect(pagoParcial.body.saldo).toBe(Number(factura.body.importeTotal) - 20000);
    const movimientos = pagoParcial.body.movimientos;
    expect(movimientos).toHaveLength(2);
    // Orden cronológico: primero el CARGO de la factura, después el PAGO
    expect(movimientos[0].tipo).toBe('CARGO');
    expect(movimientos[1].tipo).toBe('PAGO');
    expect(movimientos[1].descripcion).toBe('entrega en efectivo');
  });

  it('"quién me debe" lista solo clientes con saldo > 0', async () => {
    const { cliente: deudor } = await clienteConCargo();
    const { cliente: otroDeudor } = await clienteConCargo();
    // Cliente registrado pero sin movimientos: nunca tiene que aparecer
    const sinDeuda = await crearCliente(app.app, CLIENTE_CONSUMIDOR_FINAL);

    const conSaldo = await request(app.app.getHttpServer())
      .get('/api/clientes/con-saldo')
      .expect(200);

    const ids = conSaldo.body.map((f: { cliente: { id: string } }) => f.cliente.id);
    expect(ids).toContain(deudor.id);
    expect(ids).toContain(otroDeudor.id);
    expect(ids).not.toContain(sinDeuda.id);
    for (const fila of conSaldo.body) {
      expect(fila.saldo).toBeGreaterThan(0);
    }
  });

  it('saldar la deuda completa saca al cliente del listado de deudores', async () => {
    const { cliente, factura } = await clienteConCargo();
    const total = Number(factura.body.importeTotal);

    await request(app.app.getHttpServer())
      .post(`/api/clientes/${cliente.id}/pagos`)
      .send({ monto: total })
      .expect(201);

    const cuenta = await request(app.app.getHttpServer())
      .get(`/api/clientes/${cliente.id}/cuenta`)
      .expect(200);
    expect(cuenta.body.saldo).toBe(0);

    const conSaldo = await request(app.app.getHttpServer())
      .get('/api/clientes/con-saldo')
      .expect(200);
    expect(
      conSaldo.body.map((f: { cliente: { id: string } }) => f.cliente.id),
    ).not.toContain(cliente.id);
  });

  it('rechaza un pago sobre un cliente inexistente (404)', async () => {
    await request(app.app.getHttpServer())
      .post('/api/clientes/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee0/pagos')
      .send({ monto: 100 })
      .expect(404);
  });

  it('rechaza un pago con monto inválido (400)', async () => {
    const cliente = await crearCliente(app.app, CLIENTE_CONSUMIDOR_FINAL);

    await request(app.app.getHttpServer())
      .post(`/api/clientes/${cliente.id}/pagos`)
      .send({ monto: 0 })
      .expect(400);
    await request(app.app.getHttpServer())
      .post(`/api/clientes/${cliente.id}/pagos`)
      .send({ monto: -50 })
      .expect(400);
    await request(app.app.getHttpServer())
      .post(`/api/clientes/${cliente.id}/pagos`)
      .send({})
      .expect(400);
  });
});
