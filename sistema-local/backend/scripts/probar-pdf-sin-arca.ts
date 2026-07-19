import * as fs from 'fs';
import * as path from 'path';
import pdfMake = require('pdfmake');
import helvetica = require('pdfmake/standard-fonts/Helvetica');
import * as QRCode from 'qrcode';
import { Emisor } from '../src/facturacion/config/emisor';
import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';
import { crearComprobantePdfProvider } from '../src/facturacion/pdf/comprobante-pdf.provider';
import { AlicuotaDesglose } from '../src/facturacion/interfaces/arca-provider.interface';

pdfMake.addFonts(helvetica);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => true);

const EXTENSIONES_LOGO: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function cargarLogoComoDataUrl(ruta: string): string | undefined {
  const mime = EXTENSIONES_LOGO[path.extname(ruta).toLowerCase()];
  if (!mime) return undefined;
  try {
    const buffer = fs.readFileSync(ruta);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/**
 * Script 100% offline: genera PDFs de prueba sin llamar a ARCA ni a la DB.
 * Usa un CAE ficticio para que el QR y el PDF se vean completos.
 */
async function main() {
  const logoRuta = path.resolve(__dirname, '..', '..', '..', 'certs', 'logo-ferreteria.png');
  const logoDataUrl = cargarLogoComoDataUrl(logoRuta);

  const emisor: Emisor = {
    id: 'test',
    razonSocial: 'REFRIGERACION DIMUNDO S.A.S.',
    cuit: 20123456783,
    puntoVenta: 1,
    condicionIva: 'RI',
    ambiente: 'homologacion',
    domicilioComercial: 'Av. Siempre Viva 742',
    ingresosBrutos: '123456789',
    inicioActividades: '01/01/2020',
    logoDataUrl,
  } as Emisor;

  const items = [
    { descripcion: 'Caño PVC 3/4', cantidad: 5, precioUnitario: 12100, ivaPorcentaje: 21, unidadMedida: 2 },
    { descripcion: 'Tornillo autoperforante', cantidad: 100, precioUnitario: 1105, ivaPorcentaje: 10.5, unidadMedida: 7 },
    { descripcion: 'Cinta aislante negra 20m', cantidad: 10, precioUnitario: 3200, ivaPorcentaje: 21, unidadMedida: 7 },
    { descripcion: 'Llave stilson 14"', cantidad: 1, precioUnitario: 49800, ivaPorcentaje: 21, unidadMedida: 7 },
    { descripcion: 'Curva PVC 90° 110mm', cantidad: 8, precioUnitario: 2400, ivaPorcentaje: 10.5, unidadMedida: 7 },
  ];

  const desglose: AlicuotaDesglose[] = Comprobante.calcularDesglose(items);
  const detalle = Comprobante.armarDetalle(items);
  const totales = Comprobante.totalizar(desglose);

  const resultadoFicticio = {
    numeroComprobante: 1,
    cae: '71234567890123',
    vencimientoCae: '20260818',
    fecha: '20260719',
  };

  const tipos: { tipo: number; letra: string; receptor: { docTipo: number; docNro: number; condicionIva?: string; razonSocial?: string; domicilio?: string } }[] = [
    {
      tipo: 6, letra: 'B',
      receptor: { docTipo: 99, docNro: 0, condicionIva: 'CONSUMIDOR_FINAL', razonSocial: 'Consumidor Final', domicilio: '-' },
    },
    {
      tipo: 1, letra: 'A',
      receptor: { docTipo: 80, docNro: 20123456789, condicionIva: 'RESPONSABLE_INSCRIPTO', razonSocial: 'COOPERATIVA DE AGUA LTDA.', domicilio: 'San Martín 850' },
    },
  ];

  const salidaDir = path.join(__dirname, '..');
  const pdfProvider = crearComprobantePdfProvider();

  for (const t of tipos) {
    // Corregir el resultado ficticio: ARCA devuelve fecha en AAAAMMDD
    const comprobante = Comprobante.crearAutorizado(
      {
        emisorId: emisor.id,
        tipoComprobante: t.tipo,
        puntoVenta: emisor.puntoVenta,
        docTipoReceptor: t.receptor.docTipo,
        docNroReceptor: t.receptor.docNro,
        condicionIvaReceptor: t.receptor.condicionIva,
        razonSocialReceptor: t.receptor.razonSocial,
        domicilioReceptor: t.receptor.domicilio,
        detalle,
        condicionVenta: 'CONTADO',
      },
      desglose,
      resultadoFicticio,
    );

    const buffer = await pdfProvider.generar(comprobante, emisor);
    const nombre = `test-factura-${t.letra}.pdf`;
    const ruta = path.join(salidaDir, nombre);
    fs.writeFileSync(ruta, buffer);
    console.log(`✓ ${nombre}: ${buffer.length} bytes`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exitCode = 1;
});
