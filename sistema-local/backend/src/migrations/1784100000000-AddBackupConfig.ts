import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBackupConfig1784100000000 implements MigrationInterface {
    name = 'AddBackupConfig1784100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "config_backup" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "clave" character varying NOT NULL,
            "valor" text NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_config_backup" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_config_backup_clave" UNIQUE ("clave")
        )`);
        await queryRunner.query(`CREATE TABLE "ejecuciones_backup" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "fechaInicio" TIMESTAMP NOT NULL DEFAULT now(),
            "fechaFin" TIMESTAMP,
            "exitoLocal" boolean NOT NULL DEFAULT false,
            "exitoPendrive" boolean NOT NULL DEFAULT false,
            "exitoDrive" boolean NOT NULL DEFAULT false,
            "omitidoPendrive" boolean NOT NULL DEFAULT false,
            "omitidoDrive" boolean NOT NULL DEFAULT false,
            "detalleLocal" character varying,
            "detallePendrive" character varying,
            "detalleDrive" character varying,
            "exitoGlobal" boolean NOT NULL DEFAULT false,
            "bytesDump" integer,
            "log" text,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_ejecuciones_backup" PRIMARY KEY ("id")
        )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "ejecuciones_backup"`);
        await queryRunner.query(`DROP TABLE "config_backup"`);
    }

}
