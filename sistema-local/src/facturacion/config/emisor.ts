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

  return {
    id: process.env.EMISOR_ID ?? 'ferreteria',
    razonSocial: requerido('EMISOR_RAZON_SOCIAL'),
    cuit: Number(requerido('EMISOR_CUIT')),
    puntoVenta: Number(requerido('EMISOR_PUNTO_VENTA')),
    condicionIva: (process.env.EMISOR_CONDICION_IVA as CondicionIva) ?? 'RI',
    ambiente: (process.env.ARCA_AMBIENTE as Ambiente) ?? 'homologacion',
    // Los certificados se pasan como contenido PEM (podés leerlos de archivo o de un secret manager)
    cert: fs.readFileSync(requerido('ARCA_CERT_PATH'), 'utf8'),
    key: fs.readFileSync(requerido('ARCA_KEY_PATH'), 'utf8'),
  };
}
