/**
 * Los endpoints de PDF (presupuesto, factura) devuelven el archivo como
 * respuesta directa, algunos por POST: no se puede simplemente enlazar con
 * <a href>. Se pide el blob por HTTP y se abre en una pestaña nueva.
 */
export function abrirPdfEnNuevaPestana(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
