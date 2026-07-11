import 'dotenv/config';
import { cargarEmisorDesdeEnv } from '../src/facturacion/config/emisor';
import { crearArcaSdkProvider } from '../src/facturacion/providers/arca-sdk.provider';
import { DatosComprobante } from '../src/facturacion/interfaces/arca-provider.interface';

async function main() {
  const emisor = cargarEmisorDesdeEnv();

  if (emisor.ambiente !== 'homologacion') {
    throw new Error(
      `ARCA_AMBIENTE="${emisor.ambiente}": este script solo está permitido contra homologación.`,
    );
  }

  console.log(
    `Emisor: ${emisor.razonSocial} (CUIT ${emisor.cuit}) — punto de venta ${emisor.puntoVenta} — ambiente ${emisor.ambiente}`,
  );

  const provider = crearArcaSdkProvider(emisor);

  console.log('\n1) Verificando autenticación WSAA y conexión con WSFEv1...');
  const ultimo = await provider.ultimoComprobante('B');
  console.log(`   Último comprobante autorizado (Factura B): ${ultimo}`);

  const datos: DatosComprobante = {
    tipoFactura: 'B',
    docTipoReceptor: 99,
    docNroReceptor: 0,
    items: [{ neto: 100, ivaPorcentaje: 21 }],
  };

  console.log('\n2) Emitiendo Factura B a consumidor final (neto 100, IVA 21%)...');
  try {
    const resultado = await provider.solicitarCae(datos);
    console.log('\n--- Factura autorizada por ARCA ---');
    console.log(`CAE:              ${resultado.cae}`);
    console.log(`N° comprobante:   ${resultado.numeroComprobante}`);
    console.log(`Vencimiento CAE:  ${resultado.vencimientoCae}`);
    console.log(`Importe neto:     ${resultado.importeNeto}`);
    console.log(`Importe IVA:      ${resultado.importeIva}`);
    console.log(`Importe total:    ${resultado.importeTotal}`);
  } catch (error) {
    console.error('\n--- ARCA rechazó el comprobante ---');
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nError inesperado al probar facturación:', error);
  process.exitCode = 1;
});
