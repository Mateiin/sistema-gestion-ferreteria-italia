import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionModule } from './facturacion/modulo/facturacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
