import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { FacturacionModule } from './facturacion/modulo/facturacion.module';
import { VentasModule } from './ventas/modulo/ventas.module';
import { CajaModule } from './caja/modulo/caja.module';
import { BackupModule } from './backup/modulo/backup.module';

// Build de Angular copiado acá por `npm run build:prod` (ver
// scripts/copiar-frontend.ts) — vive junto a `dist/`, no adentro (`nest
// build` borra `dist/` en cada compilación, `deleteOutDir` en
// nest-cli.json). En dev (`npm run start:dev`) esta carpeta no existe: el
// módulo de estáticos directamente no se registra, así que no hay riesgo de
// romper el flujo con `ng serve` en 4200 por una carpeta faltante.
const CARPETA_FRONTEND = join(__dirname, '..', 'public');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...(existsSync(CARPETA_FRONTEND)
      ? [
          ServeStaticModule.forRoot({
            rootPath: CARPETA_FRONTEND,
            // No pisar la API con el fallback a index.html (deep links del
            // router de Angular) — ver main.ts, setGlobalPrefix('api').
            exclude: ['/api/{*splat}'],
          }),
        ]
      : []),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'ferreteria_local'),
        autoLoadEntities: true,
        synchronize: false,
        // El esquema lo maneja SOLO migration:generate + migration:run (ver
        // src/data-source.ts). Nunca synchronize ni ALTER TABLE manual.
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: true,
      }),
    }),
    FacturacionModule,
    VentasModule,
    CajaModule,
    BackupModule,
  ],
})
export class AppModule {}
