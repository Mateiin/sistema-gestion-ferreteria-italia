import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comprobante } from './entities/comprobante.entity';
import { FacturacionService } from './facturacion.service';
import { FacturacionController } from './facturacion.controller';
import { cargarEmisorDesdeEnv } from './config/emisor';
import { crearAfipSdkProvider } from './providers/afipsdk.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Comprobante])],
  controllers: [FacturacionController],
  providers: [
    FacturacionService,
    {
      // Emisor único para el MVP. Para multi-tenant, reemplazá por un provider
      // con scope de request que resuelva el emisor según quién factura.
      provide: 'EMISOR',
      useFactory: () => cargarEmisorDesdeEnv(),
    },
    {
      // Acá elegís el adapter concreto. Cambiar de afipsdk a otra librería
      // es cambiar SOLO esta línea.
      provide: 'ARCA_PROVIDER_FACTORY',
      useValue: crearAfipSdkProvider,
    },
  ],
})
export class FacturacionModule {}
