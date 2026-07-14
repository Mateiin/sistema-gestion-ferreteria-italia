import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';

/**
 * Test puro del cálculo de neto/IVA: no toca ARCA ni la base, corre offline.
 * `precioUnitario` es siempre NETO (sin IVA), sea Factura A o B: se suma
 * el IVA en los dos casos.
 */

let fallas = 0;

function assertIgual(descripcion: string, obtenido: number, esperado: number) {
  if (obtenido !== esperado) {
    fallas++;
    console.error(`✗ ${descripcion}: esperado ${esperado}, obtenido ${obtenido}`);
  } else {
    console.log(`✓ ${descripcion}: ${obtenido}`);
  }
}

console.log('Caso 1 — precio neto (10000, IVA 21%), sea Factura A o B');
{
  const desglose = Comprobante.calcularDesglose([
    { cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  assertIgual('neto', totales.importeNeto, 10000);
  assertIgual('iva', totales.importeIva, 2100);
  assertIgual('total', totales.importeTotal, 12100);
}

console.log('\nCaso 2 — 3 ítems a la misma alícuota (redondeo por grupo, no por línea)');
{
  // Redondeando el IVA de cada línea por separado (21.0021 -> 21.00) el total
  // da 63.00; acumulando sin redondear y redondeando una sola vez da 63.01
  // (ver nota en Comprobante.calcularDesglose).
  const desglose = Comprobante.calcularDesglose([
    { cantidad: 1, precioUnitario: 100.01, ivaPorcentaje: 21 },
    { cantidad: 1, precioUnitario: 100.01, ivaPorcentaje: 21 },
    { cantidad: 1, precioUnitario: 100.01, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  assertIgual('neto', totales.importeNeto, 300.03);
  assertIgual('iva', totales.importeIva, 63.01);
}

if (fallas > 0) {
  console.error(`\n${fallas} caso(s) fallaron.`);
  process.exitCode = 1;
} else {
  console.log('\nTodos los casos coinciden.');
}
