import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { cargarEmisorDesdeEnv } from '../src/facturacion/config/emisor';
import { crearArcaSdkProvider } from '../src/facturacion/providers/arca-sdk.provider';
import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';
import { crearComprobantePdfProvider } from '../src/facturacion/pdf/comprobante-pdf.provider';

/**
 * Prueba de punta a punta: pide un CAE real a ARCA homologación (WSAA →
 * WSFEv1), arma el Comprobante con ese resultado (Creator) y renderiza el PDF
 * con el CAE y el QR reales. Como el Gestor: solo delega a Comprobante y al
 * puerto ARCA, no calcula nada acá.
 */
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

  const items = [
    { descripcion: 'Caño PVC 3/4', cantidad: 5, precioUnitario: 12100, ivaPorcentaje: 21, unidadMedida: 2 }, // m
    { descripcion: 'Tornillo autoperforante', cantidad: 100, precioUnitario: 1105, ivaPorcentaje: 10.5, unidadMedida: 7 }, // unidades
  ];

  const desglose = Comprobante.calcularDesglose(items);
  const detalle = Comprobante.armarDetalle(items);
  const totales = Comprobante.totalizar(desglose);

  console.log('\nSolicitando CAE a ARCA homologación (Factura B, consumidor final)...');
  const resultado = await provider.solicitarCae({
    tipoFactura: 'B',
    docTipoReceptor: 99,
    docNroReceptor: 0,
    ivaDesglose: desglose,
    ...totales,
  });
  console.log(`CAE obtenido: ${resultado.cae} — comprobante Nº ${resultado.numeroComprobante}`);

  const comprobante = Comprobante.crearAutorizado(
    {
      emisorId: emisor.id,
      tipoComprobante: 6, // Factura B
      puntoVenta: emisor.puntoVenta,
      docTipoReceptor: 99,
      docNroReceptor: 0,
      detalle,
      condicionVenta: 'CUENTA_CORRIENTE',
    },
    desglose,
    resultado,
  );
  comprobante.estado = 'autorizado';

  const pdfProvider = crearComprobantePdfProvider();
  const buffer = await pdfProvider.generar(comprobante, emisor);

  const salida =
    process.env.PROBAR_PDF_SALIDA ??
    path.join(__dirname, '..', 'comprobante-prueba.pdf');
  fs.writeFileSync(salida, buffer);
  console.log(`\nPDF generado: ${salida} (${buffer.length} bytes)`);
}

main().catch((error) => {
  console.error('\nError generando el PDF de prueba:', error);
  process.exitCode = 1;
});
