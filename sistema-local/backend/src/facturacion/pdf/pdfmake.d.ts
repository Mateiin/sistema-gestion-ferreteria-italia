/**
 * pdfmake no publica tipos propios para la API de servidor (createPdf/addFonts)
 * y @types/pdfmake quedó desactualizado (solo llega a 0.3.3). Shim mínimo para
 * no perder el chequeo de tipos del resto del archivo.
 */
declare module 'pdfmake' {
  const pdfMake: any;
  export = pdfMake;
}

declare module 'pdfmake/standard-fonts/Helvetica' {
  const helvetica: any;
  export = helvetica;
}
