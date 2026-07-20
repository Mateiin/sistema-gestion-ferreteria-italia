import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { BackupGestor } from '../gestor/backup.gestor';
import { ActualizarConfigBackupDto } from '../dto/actualizar-config-backup.dto';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupGestor) {}

  // ── CONFIG ──────────────────────────────────────────────────────────────

  @Get('config')
  config() {
    return this.backup.obtenerConfig();
  }

  @Put('config')
  actualizarConfig(@Body() dto: ActualizarConfigBackupDto) {
    return this.backup.actualizarConfig(dto);
  }

  // ── EJECUTAR ────────────────────────────────────────────────────────────

  @Post('ejecutar')
  ejecutar() {
    return this.backup.ejecutar();
  }

  // ── HISTORIAL ───────────────────────────────────────────────────────────

  @Get('ejecuciones')
  ejecuciones() {
    return this.backup.listarEjecuciones();
  }

  @Get('ejecuciones/:id')
  ejecucion(@Param('id', ParseUUIDPipe) id: string) {
    return this.backup.obtenerEjecucion(id);
  }

  // ── ESTADO ──────────────────────────────────────────────────────────────

  @Get('estado')
  estado() {
    return this.backup.obtenerEstado();
  }
}
