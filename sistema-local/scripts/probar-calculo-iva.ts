import { Comprobante } from '../src/facturacion/modelo/comprobante.entity';

/**
 * Test puro del cálculo de neto/IVA: no toca ARCA ni la base, corre offline.
 * Cubre los dos casos reales verificados contra el facturador de ARCA:
 * en Factura B el precio cargado va CON IVA incluido (se extrae el neto); en
 * Factura A el precio es NETO (se suma el IVA).
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

console.log('Caso 1 — Factura B, precio con IVA incluido (12100, IVA 21%)');
{
  const desglose = Comprobante.calcularDesglose('B', [
    { cantidad: 1, precioUnitario: 12100, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  assertIgual('neto', totales.importeNeto, 10000);
  assertIgual('iva', totales.importeIva, 2100);
  assertIgual('total', totales.importeTotal, 12100);
}

console.log('\nCaso 2 — Factura A, precio neto (10000, IVA 21%)');
{
  const desglose = Comprobante.calcularDesglose('A', [
    { cantidad: 1, precioUnitario: 10000, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  assertIgual('neto', totales.importeNeto, 10000);
  assertIgual('iva', totales.importeIva, 2100);
  assertIgual('total', totales.importeTotal, 12100);
}

console.log('\nCaso 3 — Factura B, 3 ítems a la misma alícuota (redondeo por grupo, no por línea)');
{
  // Sin agrupar y redondear una sola vez, sumar los redondeos de cada línea
  // por separado da 10165.28 en vez de 10165.29 (ver nota en Comprobante.calcularDesglose).
  const desglose = Comprobante.calcularDesglose('B', [
    { cantidad: 1, precioUnitario: 12100, ivaPorcentaje: 21 },
    { cantidad: 1, precioUnitario: 100, ivaPorcentaje: 21 },
    { cantidad: 1, precioUnitario: 100, ivaPorcentaje: 21 },
  ]);
  const totales = Comprobante.totalizar(desglose);
  assertIgual('neto', totales.importeNeto, 10165.29);
}

if (fallas > 0) {
  console.error(`\n${fallas} caso(s) fallaron.`);
  process.exitCode = 1;
} else {
  console.log('\nTodos los casos coinciden.');
}
