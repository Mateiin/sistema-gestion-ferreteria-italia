import 'dotenv/config';
import { cargarEmisorDesdeEnv } from '../src/facturacion/config/emisor';
import { crearArcaSdkProvider } from '../src/facturacion/providers/arca-sdk.provider';
import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';

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

  // El cálculo (agrupar por alícuota, totalizar) es responsabilidad del
  // dominio: este script, como el Gestor, solo llama a Comprobante y delega.
  // precioUnitario es siempre NETO (sin IVA): 10000 con IVA 21% -> IVA 2100, total 12100.
  const desglose = Comprobante.calcularDesglose([
    { cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  if (totales.importeNeto !== 10000 || totales.importeIva !== 2100 || totales.importeTotal !== 12100) {
    throw new Error(
      `Cálculo de Factura B no coincide con el caso verificado: ${JSON.stringify(totales)}`,
    );
  }

  console.log('\n2) Emitiendo Factura B a consumidor final (precio neto 10000, IVA 21%, total 12100)...');
  try {
    const resultado = await provider.solicitarCae({
      tipoFactura: 'B',
      docTipoReceptor: 99,
      docNroReceptor: 0,
      ivaDesglose: desglose,
      ...totales,
    });
    console.log('\n--- Factura autorizada por ARCA ---');
    console.log(`CAE:              ${resultado.cae}`);
    console.log(`N° comprobante:   ${resultado.numeroComprobante}`);
    console.log(`Vencimiento CAE:  ${resultado.vencimientoCae}`);
    console.log(`Importe neto:     ${totales.importeNeto}`);
    console.log(`Importe IVA:      ${totales.importeIva}`);
    console.log(`Importe total:    ${totales.importeTotal}`);

    console.log('\n3) Anulando la factura recién emitida con una Nota de Crédito...');
    const resultadoNc = await provider.solicitarNotaCredito({
      tipoFactura: 'B',
      docTipoReceptor: 99,
      docNroReceptor: 0,
      ivaDesglose: desglose,
      ...totales,
      comprobanteAsociado: {
        tipoComprobante: 6, // Factura B
        puntoVenta: emisor.puntoVenta,
        numero: resultado.numeroComprobante,
      },
    });
    console.log('\n--- Nota de Crédito autorizada por ARCA ---');
    console.log(`CAE:              ${resultadoNc.cae}`);
    console.log(`N° comprobante:   ${resultadoNc.numeroComprobante}`);
    console.log(`Importe total:    ${totales.importeTotal}`);
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
