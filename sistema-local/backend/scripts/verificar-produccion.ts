import { config as cargarDotenv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cargarEmisorDesdeEnv } from '../src/facturacion/config/emisor';
import { crearArcaSdkProvider } from '../src/facturacion/providers/arca-sdk.provider';
import { ArcaProvider } from '../src/facturacion/interfaces/arca-provider.interface';

/**
 * Verificación de SOLO LECTURA contra ARCA PRODUCCIÓN: certificado, CUIT y
 * punto de venta reales, pero la ÚNICA llamada que hace es
 * `ultimoComprobante()` (WSAA para autenticar + WSFEv1 `getLastVoucher`, que
 * es una consulta — no genera ningún comprobante ni huella fiscal).
 *
 * A propósito NO importa `Comprobante`, `solicitarCae` ni `solicitarNotaCredito`:
 * este archivo no tiene ningún camino de código que pueda emitir. Comparar
 * con `scripts/probar-facturacion.ts`, que SÍ emite pero está bloqueado a
 * homologación — este script es el espejo inverso: solo corre en
 * producción y solo lee.
 *
 * NUNCA usa el ".env" de desarrollo (el que carga `npm run start:dev`,
 * `npm run backup`, etc. vía `dotenv/config`). Carga su config desde un
 * archivo APARTE para que sea imposible correr esto por accidente con datos
 * de producción mientras se desarrolla, y viceversa:
 *
 *   npm run verificar:prod
 *     -> por default busca "sistema-local/backend/.env.produccion"
 *
 *   npm run verificar:prod -- C:\ruta\a\otro\archivo.env
 *     -> o pasando la ruta como primer argumento
 *
 *   ARCA_ENV_FILE=C:\ruta\a\otro\archivo.env npm run verificar:prod
 *     -> o por variable de entorno (útil para la tarea programada/CI)
 *
 * Plantilla de ese archivo: `.env.produccion.example` (ver también
 * `docs/INSTALACION.md` → "Salto a ARCA producción (Fase 3)").
 */

function resolverRutaEnv(): string {
  const rutaCli = process.argv[2];
  const rutaEnvVar = process.env.ARCA_ENV_FILE;
  const ruta = rutaCli || rutaEnvVar || path.resolve(__dirname, '..', '.env.produccion');

  if (!fs.existsSync(ruta)) {
    throw new Error(
      `No se encontró el archivo de configuración de producción ("${ruta}"). ` +
        'Copiá ".env.produccion.example" a ".env.produccion" (o pasá la ruta como ' +
        'argumento / ARCA_ENV_FILE) y completá los datos reales antes de correr este script.',
    );
  }
  return ruta;
}

async function consultar(provider: ArcaProvider, tipo: 'A' | 'B'): Promise<void> {
  try {
    const numero = await provider.ultimoComprobante(tipo);
    const detalle = numero === 0 ? ' (nunca se facturó desde este punto de venta)' : '';
    console.log(`  Factura ${tipo}: último comprobante autorizado = ${numero}${detalle}`);
  } catch (error) {
    console.error(`  Factura ${tipo}: ERROR consultando ARCA — ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const rutaEnv = resolverRutaEnv();
  console.log(`Config de producción: ${rutaEnv}\n`);

  const resultado = cargarDotenv({ path: rutaEnv });
  if (resultado.error) throw resultado.error;

  const emisor = cargarEmisorDesdeEnv();

  // Segunda barrera además del archivo aparte: si por error ese archivo
  // apunta a homologación, este script se niega a correr igual.
  if (emisor.ambiente !== 'produccion') {
    throw new Error(
      `ARCA_AMBIENTE="${emisor.ambiente}" en "${rutaEnv}": este script es EXCLUSIVO para ` +
        'verificar PRODUCCIÓN. Para probar contra homologación (que además emite y anula ' +
        'de prueba) usá "npm run probar:fe".',
    );
  }

  console.log(
    `Emisor: ${emisor.razonSocial} (CUIT ${emisor.cuit}) — punto de venta ${emisor.puntoVenta} — ambiente ${emisor.ambiente}`,
  );
  console.log(
    '\nEste script es de SOLO LECTURA: la única llamada que hace es ultimoComprobante() ' +
      '(WSAA + WSFEv1 getLastVoucher). No emite, no anula, no genera CAE ni huella fiscal.\n',
  );

  const provider = crearArcaSdkProvider(emisor);

  console.log('Consultando ARCA producción...');
  await consultar(provider, 'A');
  await consultar(provider, 'B');

  if (process.exitCode !== 1) {
    console.log('\nOK: el certificado, el CUIT y el punto de venta de producción autentican correctamente contra ARCA.');
  }
}

main().catch((error) => {
  console.error('\nError inesperado verificando producción:', error);
  process.exitCode = 1;
});
