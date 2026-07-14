import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimientoCaja } from '../modelo/movimiento-caja.entity';
import { CierreCaja } from '../modelo/cierre-caja.entity';
import { CajaGestor } from '../gestor/caja.gestor';
import { CajaController } from '../controlador/caja.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoCaja, CierreCaja])],
  controllers: [CajaController],
  providers: [CajaGestor],
})
export class CajaModule {}
