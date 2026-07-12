import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../modelo/cliente.entity';
import { Venta } from '../modelo/venta.entity';
import { LineaVenta } from '../modelo/linea-venta.entity';
import { ClientesGestor } from '../gestor/clientes.gestor';
import { VentasGestor } from '../gestor/ventas.gestor';
import { ClientesController } from '../controlador/clientes.controller';
import { VentasController } from '../controlador/ventas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Venta, LineaVenta])],
  controllers: [ClientesController, VentasController],
  providers: [ClientesGestor, VentasGestor],
})
export class VentasModule {}
