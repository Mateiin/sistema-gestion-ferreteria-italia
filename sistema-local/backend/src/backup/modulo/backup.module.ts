import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigBackup } from '../modelo/config-backup.entity';
import { EjecucionBackup } from '../modelo/ejecucion-backup.entity';
import { BackupGestor } from '../gestor/backup.gestor';
import { BackupController } from '../controlador/backup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigBackup, EjecucionBackup])],
  controllers: [BackupController],
  providers: [BackupGestor],
})
export class BackupModule {}
