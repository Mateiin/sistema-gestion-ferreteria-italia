import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { cargarEmisorDesdeEnv } from '../src/facturacion/config/emisor';
import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';
import { crearComprobantePdfProvider } from '../src/facturacion/pdf/comprobante-pdf.provider';

/**
 * Genera un PDF de prueba SIN llamar a ARCA: arma un Comprobante mock con
 * datos ficticios y renderiza el PDF. Para verificar el layout del encabezado
 * (logo, rectángulo, letter, datos) sin gastar un CAE real.
 */
async function main() {
  const emisor = cargarEmisorDesdeEnv();
  console.log(`Emisor: ${emisor.razonSocial}`);
  console.log(`Logo cargado: ${emisor.logoDataUrl ? 'SÍ (' + emisor.logoDataUrl.slice(0, 40) + '...)' : 'NO (fallback a texto)'}`);

  const items = [
    { descripcion: 'Caño PVC 3/4', cantidad: 5, precioUnitario: 12100, ivaPorcentaje: 21, unidadMedida: 2 },
    { descripcion: 'Tornillo autoperforante x100', cantidad: 100, precioUnitario: 1105, ivaPorcentaje: 10.5, unidadMedida: 7 },
    { descripcion: 'Pintura blanca 20L', cantidad: 2, precioUnitario: 45000, ivaPorcentaje: 21, unidadMedida: 7 },
    { descripcion: 'Cinta aisladora', cantidad: 3, precioUnitario: 850, ivaPorcentaje: 21, unidadMedida: 7 },
  ];

  const desglose = Comprobante.calcularDesglose(items);
  const detalle = Comprobante.armarDetalle(items);
  const totales = Comprobante.totalizar(desglose);

  const comprobante = Comprobante.crearAutorizado(
    {
      emisorId: emisor.id,
      tipoComprobante: 6, // Factura B
      puntoVenta: emisor.puntoVenta,
      docTipoReceptor: 99,
      docNroReceptor: 0,
      razonSocialReceptor: 'Consumidor Final',
      domicilioReceptor: '-',
      detalle,
      condicionVenta: 'CONTADO',
    },
    desglose,
    {
      cae: '12345678901234',
      vencimientoCae: '20260815',
      fecha: '20260719',
      numeroComprobante: 99,
    },
  );
  comprobante.estado = 'autorizado';

  const pdfProvider = crearComprobantePdfProvider();
  const buffer = await pdfProvider.generar(comprobante, emisor);

  const salida = path.join(__dirname, '..', 'comprobante-prueba.pdf');
  fs.writeFileSync(salida, buffer);
  console.log(`\nPDF generado: ${salida} (${buffer.length} bytes)`);
  console.log('Abrilo para verificar el layout del encabezado con el logo.');
}

main().catch((error) => {
  console.error('\nError generando el PDF de prueba:', error);
  process.exitCode = 1;
});
