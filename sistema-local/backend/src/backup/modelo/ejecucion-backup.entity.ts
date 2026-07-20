import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ejecuciones_backup')
export class EjecucionBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  fechaInicio: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaFin: Date | null;

  @Column({ type: 'boolean', default: false })
  exitoLocal: boolean;

  @Column({ type: 'boolean', default: false })
  exitoPendrive: boolean;

  @Column({ type: 'boolean', default: false })
  exitoDrive: boolean;

  @Column({ type: 'boolean', default: false })
  omitidoPendrive: boolean;

  @Column({ type: 'boolean', default: false })
  omitidoDrive: boolean;

  @Column({ type: 'varchar', nullable: true })
  detalleLocal: string | null;

  @Column({ type: 'varchar', nullable: true })
  detallePendrive: string | null;

  @Column({ type: 'varchar', nullable: true })
  detalleDrive: string | null;

  @Column({ type: 'boolean', default: false })
  exitoGlobal: boolean;

  @Column({ type: 'integer', nullable: true })
  bytesDump: number | null;

  @Column({ type: 'text', nullable: true })
  log: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
