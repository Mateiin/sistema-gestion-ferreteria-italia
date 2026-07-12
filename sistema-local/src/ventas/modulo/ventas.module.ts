import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../modelo/cliente.entity';
import { Venta } from '../modelo/venta.entity';
import { LineaVenta } from '../modelo/linea-venta.entity';
import { MovimientoCtaCte } from '../modelo/movimiento-cta-cte.entity';
import { ClientesGestor } from '../gestor/clientes.gestor';
import { VentasGestor } from '../gestor/ventas.gestor';
import { CuentaCorrienteGestor } from '../gestor/cuenta-corriente.gestor';
import { ClientesController } from '../controlador/clientes.controller';
import { VentasController } from '../controlador/ventas.controller';
import { PresupuestoPdfProvider } from '../pdf/presupuesto-pdf.provider';
import { FacturacionModule } from '../../facturacion/modulo/facturacion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, Venta, LineaVenta, MovimientoCtaCte]),
    // Fase 2: VentasGestor reusa FacturacionGestor para emitir la ficha.
    FacturacionModule,
  ],
  controllers: [ClientesController, VentasController],
  providers: [
    ClientesGestor,
    VentasGestor,
    CuentaCorrienteGestor,
    PresupuestoPdfProvider,
  ],
})
export class VentasModule {}
