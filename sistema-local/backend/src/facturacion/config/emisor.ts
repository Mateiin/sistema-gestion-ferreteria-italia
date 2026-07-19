/**
 * Un "Emisor" representa a un comercio que factura con SU propia identidad fiscal.
 * Hoy hay uno solo (la ferretería del suegro), pero el sistema está pensado
 * para soportar N emisores sin tocar el código: cada uno con su CUIT, su
 * certificado y su punto de venta.
 *
 * En producción esto NO se hardcodea: se carga desde base de datos o desde
 * variables de entorno / secrets. El .key (clave privada) es secreto y nunca
 * se versiona en git.
 */
import * as fs from 'fs';
import * as path from 'path';

export type Ambiente = 'homologacion' | 'produccion';
export type CondicionIva = 'RI' | 'MONOTRIBUTO';

export interface Emisor {
  /** Identificador interno del emisor dentro de tu sistema */
  id: string;
  razonSocial: string;
  /** CUIT sin guiones, como número. Ej: 20123456783 */
  cuit: number;
  /** Punto de venta habilitado en ARCA para web services (exclusivo del sistema) */
  puntoVenta: number;
  condicionIva: CondicionIva;
  ambiente: Ambiente;
  /** Contenido del certificado .crt (string PEM) */
  cert: string;
  /** Contenido de la clave privada .key (string PEM). SECRETO. */
  key: string;
  /**
   * Datos legales para el comprobante IMPRESO (no los pide WSFEv1, pero son
   * obligatorios en el PDF). Opcionales acá para no romper el arranque de la
   * app si todavía no están en el `.env`; el generador de PDF sí los necesita.
   */
  domicilioComercial?: string;
  ingresosBrutos?: string;
  inicioActividades?: string;
  /**
   * Logo del emisor, ya como dataURL (base64), listo para pdfmake. `undefined`
   * si `EMISOR_LOGO_PATH` no está configurado o el archivo no se pudo leer —
   * en ese caso el PDF cae al texto de la razón social, no rompe la generación.
   */
  logoDataUrl?: string;
}

/**
 * El backend tiene que poder arrancar sin los certificados de ARCA (paso
 * manual posterior a instalar, ver `certs/LEEME.txt` / `docs/INSTALACION.md`):
 * si faltan, solo tiene que fallar FACTURAR, no toda la app (Caja, Ventas,
 * Clientes no dependen de ARCA). Este error identifica ese caso puntual para
 * que el Gestor lo traduzca a un mensaje HTTP claro en vez de un 500 genérico.
 */
export class CertificadosArcaFaltantesError extends Error {
  constructor(rutaEsperada: string) {
    super(
      `Faltan los certificados de ARCA (no se encontró "${rutaEsperada}"). ` +
        'Copiá homologacion.crt y homologacion.key a la carpeta certs/ (ver certs/LEEME.txt) y volvé a facturar.',
    );
    this.name = 'CertificadosArcaFaltantesError';
  }
}

/**
 * Define `propiedad` en `objetivo` como un PEM leído recién la primera vez
 * que se accede (no al armar el Emisor). Así `cargarEmisorDesdeEnv` puede
 * devolver un Emisor válido aunque el archivo todavía no exista: el error
 * (claro, `CertificadosArcaFaltantesError`) recién sale cuando algo intenta
 * usar el certificado de verdad (hoy, solo `ArcaSdkProvider` al construirse).
 */
function definirPemPerezoso(
  objetivo: object,
  propiedad: 'cert' | 'key',
  ruta: string,
): void {
  let cache: string | undefined;
  Object.defineProperty(objetivo, propiedad, {
    enumerable: true,
    get(): string {
      if (cache === undefined) {
        try {
          cache = fs.readFileSync(ruta, 'utf8');
        } catch {
          throw new CertificadosArcaFaltantesError(ruta);
        }
      }
      return cache;
    },
  });
}

const EXTENSIONES_LOGO_SOPORTADAS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Carga el logo del emisor como dataURL si `EMISOR_LOGO_PATH` está configurado
 * y el archivo existe. Nunca tira: si falta la variable, el archivo no
 * existe o la extensión no es soportada, devuelve `undefined` y el PDF usa el
 * fallback de texto (ver `formato-arca.ts`).
 */
function cargarLogoDataUrl(rutaLogo?: string): string | undefined {
  if (!rutaLogo) {
    console.warn(
      'EMISOR_LOGO_PATH no está configurado: el PDF usará el nombre del emisor como texto.',
    );
    return undefined;
  }
  const resuelta = path.resolve(rutaLogo);
  const mime = EXTENSIONES_LOGO_SOPORTADAS[path.extname(rutaLogo).toLowerCase()];
  if (!mime) {
    console.warn(
      `EMISOR_LOGO_PATH="${rutaLogo}" (resuelta: "${resuelta}") extensión no soportada (usá .png o .jpg): se usa el nombre del emisor como texto.`,
    );
    return undefined;
  }
  try {
    const buffer = fs.readFileSync(resuelta);
    console.log(
      `Logo del emisor cargado desde "${resuelta}" (${buffer.length} bytes).`,
    );
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn(
      `No se pudo leer EMISOR_LOGO_PATH="${rutaLogo}" (resuelta: "${resuelta}"): ${err instanceof Error ? err.message : err}. Se usa el nombre del emisor como texto.`,
    );
    return undefined;
  }
}

/**
 * Carga del emisor desde variables de entorno para el MVP de un solo comercio.
 * Cuando pases a multi-tenant, reemplazás esto por una consulta a la tabla de emisores.
 */
export function cargarEmisorDesdeEnv(): Emisor {
  const requerido = (clave: string): string => {
    const valor = process.env[clave];
    if (!valor) throw new Error(`Falta la variable de entorno ${clave}`);
    return valor;
  };

  const emisor = {
    id: process.env.EMISOR_ID ?? 'ferreteria',
    razonSocial: requerido('EMISOR_RAZON_SOCIAL'),
    cuit: Number(requerido('EMISOR_CUIT')),
    puntoVenta: Number(requerido('EMISOR_PUNTO_VENTA')),
    condicionIva: (process.env.EMISOR_CONDICION_IVA as CondicionIva) ?? 'RI',
    ambiente: (process.env.ARCA_AMBIENTE as Ambiente) ?? 'homologacion',
    domicilioComercial: process.env.EMISOR_DOMICILIO_COMERCIAL,
    ingresosBrutos: process.env.EMISOR_INGRESOS_BRUTOS,
    inicioActividades: process.env.EMISOR_INICIO_ACTIVIDADES,
    logoDataUrl: cargarLogoDataUrl(process.env.EMISOR_LOGO_PATH),
  } as Emisor;

  // Contenido PEM: perezoso a propósito (ver definirPemPerezoso) -- las
  // variables de entorno con la RUTA sí son obligatorias ahora (requerido),
  // pero el ARCHIVO en esa ruta recién se lee cuando algo va a facturar.
  definirPemPerezoso(emisor, 'cert', requerido('ARCA_CERT_PATH'));
  definirPemPerezoso(emisor, 'key', requerido('ARCA_KEY_PATH'));

  return emisor;
}
