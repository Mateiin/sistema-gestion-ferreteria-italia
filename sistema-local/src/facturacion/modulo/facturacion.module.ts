import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comprobante } from '../modelo/comprobante.entity';
import { FacturacionGestor } from '../gestor/facturacion.gestor';
import { FacturacionController } from '../controlador/facturacion.controller';
import { cargarEmisorDesdeEnv } from '../config/emisor';
import { crearArcaSdkProvider } from '../providers/arca-sdk.provider';
import { ComprobantePdfProvider } from '../pdf/comprobante-pdf.provider';

@Module({
  imports: [TypeOrmModule.forFeature([Comprobante])],
  controllers: [FacturacionController],
  providers: [
    FacturacionGestor,
    ComprobantePdfProvider,
    {
      // Emisor único para el MVP. Para multi-tenant, reemplazá por un provider
      // con scope de request que resuelva el emisor según quién factura.
      provide: 'EMISOR',
      useFactory: () => cargarEmisorDesdeEnv(),
    },
    {
      // Acá elegís el adapter concreto. Cambiar de librería es cambiar SOLO
      // esta línea (por ej. otro SDK, SOAP directo, etc.).
      provide: 'ARCA_PROVIDER_FACTORY',
      useValue: crearArcaSdkProvider,
    },
  ],
  // Ventas (Fase 2) reusa FacturacionGestor para emitir la ficha como factura.
  exports: [FacturacionGestor],
})
export class FacturacionModule {}
