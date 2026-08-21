import request from 'supertest';
import {
  MedioPago,
  MovimientoCaja,
} from '../../caja/modelo/movimiento-caja.entity';
import { crearAplicacionDePrueba, AppPrueba } from './helpers/app-de-prueba';

/**
 * E2E de caja: carga de movimientos, arqueo del día, cierre y edición de un
 * día ya cerrado. SQLite en memoria, gestor real, sin ARCA (la caja no lo
 * usa).
 */
describe('Caja (e2e)', () => {
  let app: AppPrueba;

  beforeAll(async () => {
    app = await crearAplicacionDePrueba();
  });

  afterAll(async () => {
    await app.app.close();
  });

  function registrar(body: Record<string, unknown>) {
    return request(app.app.getHttpServer())
      .post('/api/caja/movimientos')
      .send(body);
  }

  async function dia(fecha?: string) {
    const query = fecha ? `?fecha=${fecha}` : '';
    const res = await request(app.app.getHttpServer())
      .get(`/api/caja/dia${query}`)
      .expect(200);
    return res.body;
  }

  it('carga del día: ventas suman por medio de pago, el retiro resta de efectivo', async () => {
    await registrar({ monto: 500, medioPago: 'EFECTIVO', descripcion: 'venta mostrador' }).expect(201);
    await registrar({ monto: 300, medioPago: 'TRANSFERENCIA' }).expect(201);
    await registrar({ monto: 200, medioPago: 'TARJETA' }).expect(201);
    // Retiro: plata que sale de la caja, siempre EFECTIVO aunque el body
    // diga otra cosa (regla del modelo)
    const retiro = await registrar({
      monto: 100,
      tipo: 'RETIRO',
      medioPago: 'TRANSFERENCIA',
    }).expect(201);

    expect(retiro.body.medioPago).toBe('EFECTIVO');

    const cajaHoy = await dia();
    expect(cajaHoy.movimientos).toHaveLength(4);
    expect(Number(cajaHoy.total)).toBe(900); // 500 + 300 + 200 - 100
    expect(Number(cajaHoy.porMedioPago.EFECTIVO)).toBe(400); // 500 - 100
    expect(Number(cajaHoy.porMedioPago.TRANSFERENCIA)).toBe(300);
    expect(Number(cajaHoy.porMedioPago.TARJETA)).toBe(200);
    expect(Number(cajaHoy.porMedioPago.OTRO)).toBe(0);
  });

  it('rechaza un movimiento con monto inválido (400)', async () => {
    await registrar({ monto: 0 }).expect(400);
    await registrar({ monto: -10 }).expect(400);
    await registrar({}).expect(400);
    await registrar({ monto: 100, medioPago: 'NO_EXISTE' }).expect(400);
  });

  it('borrar un movimiento del día actualiza los totales', async () => {
    const alta = await registrar({ monto: 250, medioPago: 'EFECTIVO' }).expect(201);

    await request(app.app.getHttpServer())
      .delete(`/api/caja/movimientos/${alta.body.id}`)
      .expect(200);

    const cajaHoy = await dia();
    expect(cajaHoy.movimientos.find((m: { id: string }) => m.id === alta.body.id)).toBeUndefined();
  });

  it('borrar un movimiento inexistente da 404', async () => {
    await request(app.app.getHttpServer())
      .delete('/api/caja/movimientos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee0')
      .expect(404);
  });

  it('cerrar el día: archiva los movimientos bajo el cierre y vacía la caja', async () => {
    // Día anterior cargado directo por repositorio para ser deterministas
    const movsRepo = app.ds.getRepository(MovimientoCaja);
    await movsRepo.save([
      MovimientoCaja.crear(700, 'venta vieja', MedioPago.EFECTIVO, '2026-08-19'),
      MovimientoCaja.crear(150, undefined, MedioPago.TARJETA, '2026-08-19'),
    ]);

    const cajaAyer = await dia('2026-08-19');
    expect(cajaAyer.movimientos).toHaveLength(2);
    expect(Number(cajaAyer.total)).toBe(850);

    const cierre = await request(app.app.getHttpServer())
      .post('/api/caja/cierres')
      .send({ fecha: '2026-08-19' })
      .expect(201);

    expect(cierre.body.fecha).toBe('2026-08-19');
    expect(Number(cierre.body.montoTotal)).toBe(850);
    expect(Number(cierre.body.montoEfectivo)).toBe(700);
    expect(Number(cierre.body.montoTarjeta)).toBe(150);
    expect(Number(cierre.body.montoTransferencia)).toBe(0);

    // Los movimientos quedaron archivados bajo el cierre: la caja del día ya no los muestra
    const despues = await dia('2026-08-19');
    expect(despues.movimientos).toHaveLength(0);
    expect(Number(despues.total)).toBe(0);
  });

  it('rechaza cerrar dos veces la misma fecha (409)', async () => {
    await request(app.app.getHttpServer())
      .post('/api/caja/cierres')
      .send({ fecha: '2026-08-19' })
      .expect(409);
  });

  it('listado de cierres y detalle con sus movimientos', async () => {
    const listado = await request(app.app.getHttpServer())
      .get('/api/caja/cierres')
      .expect(200);
    expect(listado.body).toHaveLength(1);
    expect(listado.body[0].fecha).toBe('2026-08-19');

    const detalle = await request(app.app.getHttpServer())
      .get(`/api/caja/cierres/${listado.body[0].id}`)
      .expect(200);
    expect(detalle.body.movimientos).toHaveLength(2);
    expect(Number(detalle.body.cierre.montoTotal)).toBe(850);
  });

  it('editar un cierre ya cerrado: agregar un movimiento olvidado recalcula los totales', async () => {
    const listado = await request(app.app.getHttpServer())
      .get('/api/caja/cierres')
      .expect(200);
    const cierreId = listado.body[0].id;

    // El titular olvidó una transferencia de ese día
    const agregado = await registrar({
      monto: 90,
      medioPago: 'TRANSFERENCIA',
      cierreId,
    }).expect(201);
    // La fecha del movimiento pasa a ser la del cierre, no la de hoy
    expect(agregado.body.fecha).toBe('2026-08-19');

    const detalle = await request(app.app.getHttpServer())
      .get(`/api/caja/cierres/${cierreId}`)
      .expect(200);
    expect(detalle.body.movimientos).toHaveLength(3);
    expect(Number(detalle.body.cierre.montoTotal)).toBe(940); // 850 + 90
    expect(Number(detalle.body.cierre.montoTransferencia)).toBe(90);

    // Y el movimiento NO aparece en ninguna caja abierta: está atado al cierre
    const cajaAyer = await dia('2026-08-19');
    expect(cajaAyer.movimientos).toHaveLength(0);
  });

  it('editar un cierre ya cerrado: borrar un movimiento también recalcula', async () => {
    const listado = await request(app.app.getHttpServer())
      .get('/api/caja/cierres')
      .expect(200);
    const cierreId = listado.body[0].id;
    const detalleAntes = await request(app.app.getHttpServer())
      .get(`/api/caja/cierres/${cierreId}`)
      .expect(200);
    const aBorrar = detalleAntes.body.movimientos.find(
      (m: { descripcion?: string | null }) => m.descripcion === 'venta vieja',
    );

    await request(app.app.getHttpServer())
      .delete(`/api/caja/movimientos/${aBorrar.id}`)
      .expect(200);

    const detalleDespues = await request(app.app.getHttpServer())
      .get(`/api/caja/cierres/${cierreId}`)
      .expect(200);
    expect(detalleDespues.body.movimientos).toHaveLength(2);
    expect(Number(detalleDespues.body.cierre.montoTotal)).toBe(240); // 940 - 700
    expect(Number(detalleDespues.body.cierre.montoEfectivo)).toBe(0); // era el único efectivo
  });

  it('un movimiento con cierreId inexistente da 404', async () => {
    await registrar({
      monto: 50,
      cierreId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
    }).expect(404);
  });
});
