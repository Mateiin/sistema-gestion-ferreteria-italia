import request from 'supertest';
import {
  abrirFicha,
  agregarLinea,
  cargarLineasTypicas,
  crearAplicacionDePrueba,
  crearCliente,
  CLIENTE_CONSUMIDOR_FINAL,
  CLIENTE_RESPONSABLE_INSCRIPTO,
  facturar,
  AppPrueba,
} from './helpers/app-de-prueba';

/**
 * E2E del flujo crítico de facturación de fichas: HTTP real + gestores y
 * providers de PDF reales sobre SQLite en memoria, con ARCA mockeado a nivel
 * de PUERTO (ArcaProvider), no de gestores — acá se prueba el enganche
 * completo: validación → armado del DTO → CAE → transacción → cuenta corriente.
 */
describe('Facturar ficha (e2e)', () => {
  let app: AppPrueba;

  beforeAll(async () => {
    app = await crearAplicacionDePrueba();
  });

  afterAll(async () => {
    await app.app.close();
  });

  afterEach(() => {
    app.arca.permitirTodo();
  });

  it('flujo completo CONTADO con cliente Consumidor Final → Factura B, ficha EMITIDA, sin cargo', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);

    const res = await facturar(app.app, ficha.id, 'CONTADO').expect(201);

    // Factura B autorizada por el ARCA falso
    expect(res.body.tipoComprobante).toBe(6);
    expect(res.body.cae).toBe('91000000000001');
    expect(res.body.vencimientoCae).toBe('20260920');
    expect(Number(res.body.importeNeto)).toBe(700);
    expect(Number(res.body.importeIva)).toBe(126);
    expect(Number(res.body.importeTotal)).toBe(826);
    // El receptor se autocompletó desde el registro del cliente
    expect(res.body.docTipoReceptor).toBe(99);
    expect(res.body.ventaId).toBe(ficha.id);
    // El detalle viaja como registro local (no a ARCA) pero queda persistido
    expect(res.body.detalle).toHaveLength(2);
    expect(res.body.detalle[0].descripcion).toBe('Tornillo 1/4 x50');
    expect(res.body.ivaDesglose).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alicuotaPorcentaje: 21, neto: 500, iva: 105 }),
        expect.objectContaining({ alicuotaPorcentaje: 10.5, neto: 200, iva: 21 }),
      ]),
    );

    // Lo que le llegó a ARCA: solo totales por alícuota, sin detalle
    const datosEnviados = app.arca.solicitarCae.mock.calls[0][0];
    expect(datosEnviados.ivaDesglose).toHaveLength(2);
    expect(datosEnviados).not.toHaveProperty('items');

    // La ficha quedó EMITIDA y ya no acepta líneas
    const fichaDespues = await request(app.app.getHttpServer())
      .get(`/api/ventas/${ficha.id}`)
      .expect(200);
    expect(fichaDespues.body.estado).toBe('EMITIDA');

    await request(app.app.getHttpServer())
      .post(`/api/ventas/${ficha.id}/lineas`)
      .send({ descripcion: 'Clavo', cantidad: 1, precioUnitario: 10 })
      .expect(400);

    // CONTADO no toca la cuenta corriente
    const cuenta = await request(app.app.getHttpServer())
      .get(`/api/clientes/${cliente.id}/cuenta`)
      .expect(200);
    expect(cuenta.body.saldo).toBe(0);
    expect(cuenta.body.movimientos).toHaveLength(0);
  });

  it('flujo CUENTA_CORRIENTE con cliente Responsable Inscripto → Factura A con CARGO por el total', async () => {
    const cliente = await crearCliente(app.app, CLIENTE_RESPONSABLE_INSCRIPTO);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);

    const res = await facturar(app.app, ficha.id, 'CUENTA_CORRIENTE').expect(201);

    expect(res.body.tipoComprobante).toBe(1); // Factura A
    expect(res.body.condicionIvaReceptor).toBe('RESPONSABLE_INSCRIPTO');
    expect(res.body.razonSocialReceptor).toBe(CLIENTE_RESPONSABLE_INSCRIPTO.razonSocial);
    expect(res.body.domicilioReceptor).toBe(CLIENTE_RESPONSABLE_INSCRIPTO.domicilio);

    // El cargo quedó registrado por exactamente el total de la factura
    const cuenta = await request(app.app.getHttpServer())
      .get(`/api/clientes/${cliente.id}/cuenta`)
      .expect(200);
    expect(cuenta.body.saldo).toBe(826);
    expect(cuenta.body.movimientos).toHaveLength(1);
    expect(cuenta.body.movimientos[0]).toMatchObject({
      tipo: 'CARGO',
      comprobanteId: res.body.id,
    });
    expect(Number(cuenta.body.movimientos[0].monto)).toBe(826);
  });

  it('si ARCA rechaza el comprobante, la ficha queda ABIERTA y sin cargo', async () => {
    const cliente = await crearCliente(app.app, CLIENTE_RESPONSABLE_INSCRIPTO);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);

    app.arca.hacerRechazar('100 - No se pudo obtener el CAE');

    const res = await facturar(app.app, ficha.id, 'CONTADO').expect(500);
    expect(JSON.stringify(res.body.message)).toContain('ARCA rechazó');

    // Nada cambió: ni ficha, ni comprobantes, ni saldo
    const fichaDespues = await request(app.app.getHttpServer())
      .get(`/api/ventas/${ficha.id}`)
      .expect(200);
    expect(fichaDespues.body.estado).toBe('ABIERTA');

    const listado = await request(app.app.getHttpServer())
      .get('/api/facturacion/facturas')
      .expect(200);
    // Puede haber comprobantes de tests anteriores en la misma base: lo que
    // no puede haber es uno nuevo para ESTA ficha
    expect(listado.body.find((c: { ventaId?: string }) => c.ventaId === ficha.id)).toBeUndefined();

    const cuenta = await request(app.app.getHttpServer())
      .get(`/api/clientes/${cliente.id}/cuenta`)
      .expect(200);
    expect(cuenta.body.movimientos).toHaveLength(0);
  });

  it('rechaza facturar una ficha sin líneas y ni siquiera consulta ARCA (400)', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);

    // El contador de llamadas es compartido con los otros tests de este archivo
    app.arca.solicitarCae.mockClear();

    await facturar(app.app, ficha.id, 'CONTADO').expect(400);

    expect(app.arca.solicitarCae).not.toHaveBeenCalled();
  });

  it('rechaza facturar dos veces la misma ficha (400) y emite una sola vez', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);

    // El contador de llamadas es compartido con los otros tests de este archivo
    app.arca.solicitarCae.mockClear();

    await facturar(app.app, ficha.id, 'CONTADO').expect(201);
    await facturar(app.app, ficha.id, 'CONTADO').expect(400);

    expect(app.arca.solicitarCae).toHaveBeenCalledTimes(1);
  });

  it('numera las facturas en secuencia (numeración por tipo, como ARCA)', async () => {
    const primera = await emitirFacturaNueva();
    const segunda = await emitirFacturaNueva();

    expect(segunda.numero).toBe(primera.numero + 1);
  });

  async function emitirFacturaNueva(): Promise<{ id: string; numero: number }> {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await agregarLinea(app.app, ficha.id, {
      descripcion: 'Candado',
      cantidad: 1,
      precioUnitario: 3000,
    });
    const res = await facturar(app.app, ficha.id, 'CONTADO').expect(201);
    return { id: res.body.id, numero: res.body.numero };
  }

  it('el presupuesto es un PDF que NO cambia el estado de la ficha', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);

    const pdf = await request(app.app.getHttpServer())
      .post(`/api/ventas/${ficha.id}/presupuesto`)
      .expect(201);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.toString().startsWith('%PDF')).toBe(true);

    const fichaDespues = await request(app.app.getHttpServer())
      .get(`/api/ventas/${ficha.id}`)
      .expect(200);
    expect(fichaDespues.body.estado).toBe('ABIERTA');
  });

  it('anula una factura emitida con Nota de Crédito de la misma letra', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await cargarLineasTypicas(app.app, ficha.id);
    const factura = await facturar(app.app, ficha.id, 'CONTADO').expect(201);

    const nc = await request(app.app.getHttpServer())
      .post(`/api/facturacion/facturas/${factura.body.id}/nota-credito`)
      .expect(201);

    expect(nc.body.tipoComprobante).toBe(8); // NC B
    expect(nc.body.comprobanteOriginalId).toBe(factura.body.id);
    expect(Number(nc.body.importeTotal)).toBe(826);

    const listado = await request(app.app.getHttpServer())
      .get('/api/facturacion/facturas')
      .expect(200);
    const original = listado.body.find((c: { id: string }) => c.id === factura.body.id);
    expect(original.estado).toBe('anulado');
  });

  it('rechaza anular dos veces la misma factura (400)', async () => {
    const cliente = await crearCliente(app.app);
    const ficha = await abrirFicha(app.app, cliente.id);
    await agregarLinea(app.app, ficha.id, {
      descripcion: 'Serrucho',
      cantidad: 1,
      precioUnitario: 1500,
    });
    const factura = await facturar(app.app, ficha.id, 'CONTADO').expect(201);

    await request(app.app.getHttpServer())
      .post(`/api/facturacion/facturas/${factura.body.id}/nota-credito`)
      .expect(201);
    await request(app.app.getHttpServer())
      .post(`/api/facturacion/facturas/${factura.body.id}/nota-credito`)
      .expect(400);
  });
});
