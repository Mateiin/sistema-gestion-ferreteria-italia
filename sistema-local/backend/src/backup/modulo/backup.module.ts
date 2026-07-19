import { Module } from '@nestjs/common';
import { BackupGestor } from '../gestor/backup.gestor';
import { BackupController } from '../controlador/backup.controller';

@Module({
  controllers: [BackupController],
  providers: [BackupGestor],
})
export class BackupModule {}
