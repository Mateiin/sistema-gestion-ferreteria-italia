import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimientoCaja } from '../modelo/movimiento-caja.entity';
import { CajaGestor } from '../gestor/caja.gestor';
import { CajaController } from '../controlador/caja.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoCaja])],
  controllers: [CajaController],
  providers: [CajaGestor],
})
export class CajaModule {}
