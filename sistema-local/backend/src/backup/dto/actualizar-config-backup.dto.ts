import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarConfigBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  BACKUP_DIR_LOCAL?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  BACKUP_DIR_PENDRIVE?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  BACKUP_DIR_DRIVE?: string;
}
