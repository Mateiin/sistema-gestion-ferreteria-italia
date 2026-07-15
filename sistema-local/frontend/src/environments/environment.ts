// Producción: el backend sirve este mismo build en su raíz (ver
// AppModule → ServeStaticModule), así que la API queda en el mismo origen.
// Relativo a propósito: no hardcodea host/puerto, funciona sea cual sea el
// nombre/IP de la PC del local.
export const environment = {
  apiBaseUrl: '/api',
};

