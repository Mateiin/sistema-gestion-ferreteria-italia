import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCajaSimple1783908488473 implements MigrationInterface {
    name = 'AddCajaSimple1783908488473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "movimientos_caja" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fecha" date NOT NULL, "monto" numeric(15,2) NOT NULL, "descripcion" character varying, "medioPago" character varying NOT NULL DEFAULT 'EFECTIVO', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a35825837a156d21e0b922fa627" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4b1c8fcb137830a63b0c899146" ON "movimientos_caja"  ("fecha") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_4b1c8fcb137830a63b0c899146"`);
        await queryRunner.query(`DROP TABLE "movimientos_caja"`);
    }

}
