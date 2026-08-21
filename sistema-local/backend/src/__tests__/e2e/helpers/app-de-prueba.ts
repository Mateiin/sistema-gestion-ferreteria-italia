import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Emisor } from '../../../facturacion/config/emisor';
import {
  ArcaProvider,
  DatosComprobante,
  DatosNotaCredito,
  ResultadoCae,
} from '../../../facturacion/interfaces/arca-provider.interface';
import { Comprobante } from '../../../facturacion/modelo/comprobante.entity';
import { FacturacionController } from '../../../facturacion/controlador/facturacion.controller';
import { FacturacionGestor } from '../../../facturacion/gestor/facturacion.gestor';
import { ComprobantePdfProvider } from '../../../facturacion/pdf/comprobante-pdf.provider';
import { Cliente } from '../../../ventas/modelo/cliente.entity';
import { LineaVenta } from '../../../ventas/modelo/linea-venta.entity';
import { MovimientoCtaCte } from '../../../ventas/modelo/movimiento-cta-cte.entity';
import { Venta } from '../../../ventas/modelo/venta.entity';
import { ClientesController } from '../../../ventas/controlador/clientes.controller';
import { VentasController } from '../../../ventas/controlador/ventas.controller';
import { ClientesGestor } from '../../../ventas/gestor/clientes.gestor';
import { CuentaCorrienteGestor } from '../../../ventas/gestor/cuenta-corriente.gestor';
import { VentasGestor } from '../../../ventas/gestor/ventas.gestor';
import { PresupuestoPdfProvider } from '../../../ventas/pdf/presupuesto-pdf.provider';
import {
  MedioPago,
  MovimientoCaja,
} from '../../../caja/modelo/movimiento-caja.entity';
import { CierreCaja } from '../../../caja/modelo/cierre-caja.entity';
import { CajaController } from '../../../caja/controlador/caja.controller';
import { CajaGestor } from '../../../caja/gestor/caja.gestor';

/**
 * Emisor fijo para los tests: nunca toca el `.env` ni certificados reales.
 * `cert`/`key` no se leen acá porque el adapter real de ARCA nunca se
 * instancia (el factory que se inyecta es el fake).
 */
export const EMISOR_DE_PRUEBA: Emisor = {
  id: 'ferreteria-test',
  razonSocial: 'Ferretería de Prueba S.R.L.',
  cuit: 20123456786,
  puntoVenta: 1,
  condicionIva: 'RI',
  ambiente: 'homologacion',
  cert: 'no-se-usa-en-tests',
  key: 'no-se-usa-en-tests',
};

type SerieNumeracion = 'A' | 'B' | 'NC_A' | 'NC_B';

export interface ArcaFalso {
  provider: ArcaProvider;
  /** Últimos datos recibidos en cada llamada, para asertar el armado del DTO */
  solicitarCae: jest.Mock;
  solicitarNotaCredito: jest.Mock;
  /** A partir de acá ARCA rechaza todo con este error (hasta resetear) */
  hacerRechazar: (mensaje: string) => void;
  permitirTodo: () => void;
  numeroAsignado(serie: SerieNumeracion): number;
}

function crearArcaFalso(): ArcaFalso {
  const contadores: Record<SerieNumeracion, number> = {
    A: 0,
    B: 0,
    NC_A: 0,
    NC_B: 0,
  };
  let errorAImitar: Error | null = null;

  const autorizar = (serie: SerieNumeracion): ResultadoCae => {
    if (errorAImitar) throw errorAImitar;
    contadores[serie] += 1;
    return {
      // Numeración incremental por serie, como la numeración real por
      // tipo de comprobante de ARCA.
      numeroComprobante: contadores[serie],
      cae: String(91000000000000 + contadores[serie]),
      vencimientoCae: '20260920',
      fecha: '20260821',
    };
  };

  const solicitarCae = jest.fn(
    async (datos: DatosComprobante): Promise<ResultadoCae> =>
      autorizar(datos.tipoFactura),
  );
  const solicitarNotaCredito = jest.fn(
    async (datos: DatosNotaCredito): Promise<ResultadoCae> =>
      autorizar(`NC_${datos.tipoFactura}` as SerieNumeracion),
  );

  return {
    provider: {
      ultimoComprobante: jest.fn(
        async (tipoFactura: 'A' | 'B') => contadores[tipoFactura],
      ),
      solicitarCae,
      solicitarNotaCredito,
    },
    solicitarCae,
    solicitarNotaCredito,
    hacerRechazar: (mensaje: string) => {
      errorAImitar = new Error(mensaje);
    },
    permitirTodo: () => {
      errorAImitar = null;
    },
    numeroAsignado: (serie: SerieNumeracion) => contadores[serie],
  };
}

const ENTIDADES = [
  Cliente,
  Venta,
  LineaVenta,
  MovimientoCtaCte,
  Comprobante,
  MovimientoCaja,
  CierreCaja,
];

export interface AppPrueba {
  app: INestApplication;
  arca: ArcaFalso;
  ds: DataSource;
}

/**
 * Monta una app NestJS REAL (gestores, controllers y providers de PDF de
 * verdad) sobre SQLite en memoria, mockeando únicamente el puerto externo
 * (`ARCA_PROVIDER_FACTORY`). Espeja lo que hace `main.ts`: prefijo `/api` +
 * ValidationPipe igual al de producción.
 */
export async function crearAplicacionDePrueba(): Promise<AppPrueba> {
  const arca = crearArcaFalso();

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: ENTIDADES,
        synchronize: true,
      }),
      TypeOrmModule.forFeature(ENTIDADES),
    ],
    controllers: [
      ClientesController,
      VentasController,
      CajaController,
      FacturacionController,
    ],
    providers: [
      ClientesGestor,
      VentasGestor,
      CuentaCorrienteGestor,
      FacturacionGestor,
      CajaGestor,
      PresupuestoPdfProvider,
      ComprobantePdfProvider,
      { provide: 'EMISOR', useValue: EMISOR_DE_PRUEBA },
      { provide: 'ARCA_PROVIDER_FACTORY', useFactory: () => () => arca.provider },
    ],
  }).compile();

  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, arca, ds: module.get(DataSource) };
}

// ---------------------------------------------------------------------------
// Wrappers HTTP chicos para que los specs se lean como el flujo del negocio
// ---------------------------------------------------------------------------

export interface ClienteDePrueba {
  razonSocial: string;
  docTipo: number;
  docNro: number;
  condicionIva: string;
  domicilio?: string;
}

export const CLIENTE_CONSUMIDOR_FINAL: ClienteDePrueba = {
  razonSocial: 'Juan Pérez',
  docTipo: 99,
  docNro: 0,
  condicionIva: 'CONSUMIDOR_FINAL',
};

export const CLIENTE_RESPONSABLE_INSCRIPTO: ClienteDePrueba = {
  razonSocial: 'Cooperativa de Agua S.A.',
  docTipo: 80,
  docNro: 30712345678,
  condicionIva: 'RESPONSABLE_INSCRIPTO',
  domicilio: 'Av. San Martín 1234',
};

export function crearCliente(
  app: INestApplication,
  datos: ClienteDePrueba = CLIENTE_CONSUMIDOR_FINAL,
): Promise<Cliente> {
  return request(app.getHttpServer())
    .post('/api/clientes')
    .send(datos)
    .expect(201)
    .then((res) => res.body);
}

export function abrirFicha(app: INestApplication, clienteId: string) {
  return request(app.getHttpServer())
    .post('/api/ventas/abrir')
    .send({ clienteId })
    .expect(201)
    .then((res) => res.body);
}

export function agregarLinea(
  app: INestApplication,
  ventaId: string,
  linea: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post(`/api/ventas/${ventaId}/lineas`)
    .send(linea)
    .expect(201)
    .then((res) => res.body);
}

/** Ficha típica de ferretería: neto 700 (500 al 21% + 200 al 10,5%), IVA 126, total 826 */
export function cargarLineasTypicas(
  app: INestApplication,
  ventaId: string,
): Promise<unknown> {
  return agregarLinea(app, ventaId, {
    descripcion: 'Tornillo 1/4 x50',
    cantidad: 10,
    precioUnitario: 50,
  }).then(() =>
    agregarLinea(app, ventaId, {
      descripcion: 'Lija al agua 220',
      cantidad: 2,
      precioUnitario: 100,
      ivaPorcentaje: 10.5,
    }),
  );
}

export function facturar(
  app: INestApplication,
  ventaId: string,
  condicionVenta: string,
) {
  return request(app.getHttpServer())
    .post(`/api/ventas/${ventaId}/facturar`)
    .send({ condicionVenta });
}
