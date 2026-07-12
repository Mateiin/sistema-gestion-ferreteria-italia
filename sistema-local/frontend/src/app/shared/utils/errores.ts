import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extrae un mensaje legible de un error HTTP. NestJS devuelve
 * `{ statusCode, message, error }`, donde `message` puede ser un string
 * (nuestras excepciones de dominio, ej. el rechazo de ARCA) o un array de
 * strings (errores de validación de class-validator).
 */
export function extraerMensajeError(
  error: unknown,
  fallback = 'Ocurrió un error inesperado.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. ¿Está corriendo el backend?';
    }
    const cuerpo = error.error as { message?: string | string[] } | null;
    const mensaje = cuerpo?.message;
    if (Array.isArray(mensaje)) return mensaje.join(' / ');
    if (typeof mensaje === 'string') return mensaje;
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Igual que `extraerMensajeError`, pero para llamadas con `responseType: 'blob'`
 * (los PDFs): si el backend devuelve un error, Angular igual intenta parsear el
 * cuerpo como Blob (no como JSON), así que hay que leerlo aparte.
 */
export async function extraerMensajeErrorAsync(
  error: unknown,
  fallback = 'Ocurrió un error inesperado.',
): Promise<string> {
  if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
    try {
      const texto = await error.error.text();
      const cuerpo = JSON.parse(texto) as { message?: string | string[] };
      if (Array.isArray(cuerpo.message)) return cuerpo.message.join(' / ');
      if (typeof cuerpo.message === 'string') return cuerpo.message;
    } catch {
      // El cuerpo no era JSON: seguimos con el mensaje genérico de abajo.
    }
  }
  return extraerMensajeError(error, fallback);
}
