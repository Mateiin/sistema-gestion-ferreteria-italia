import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copia el build de producción del frontend (Angular) a `backend/public/`,
 * de donde lo sirve `ServeStaticModule` (ver AppModule). Vive AL LADO de
 * `dist/`, no adentro: `nest build` borra `dist/` en cada compilación
 * (`deleteOutDir` en nest-cli.json) y se llevaría puesto el frontend si
 * estuviera ahí. Paso intermedio de `npm run build:prod`.
 */

const origen = join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser');
const destino = join(__dirname, '..', 'public');

if (!existsSync(origen)) {
  console.error(
    `No se encontró el build del frontend en "${origen}".\n` +
      'Corré "npm run build:frontend" (o "npm run build:prod", que ya lo hace primero) desde sistema-local/backend.',
  );
  process.exit(1);
}

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
// cpSync copia la carpeta origen DENTRO del destino si existe. Leemos el
// contenido explicitamente para copiar solo los archivos:
for (const entry of readdirSync(origen)) {
  cpSync(join(origen, entry), join(destino, entry), { recursive: true });
}

console.log(`Frontend copiado a "${destino}".`);
