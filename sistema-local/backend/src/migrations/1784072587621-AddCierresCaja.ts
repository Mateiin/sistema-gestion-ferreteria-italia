import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCierresCaja1784072587621 implements MigrationInterface {
    name = 'AddCierresCaja1784072587621'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "cierres_caja" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fecha" date NOT NULL, "montoTotal" numeric(15,2) NOT NULL, "montoEfectivo" numeric(15,2) NOT NULL, "montoTransferencia" numeric(15,2) NOT NULL, "montoTarjeta" numeric(15,2) NOT NULL, "montoOtro" numeric(15,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_745ea63bc26660d2a5b1b81eac0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0fcbb9f42ca1ed46f5067534c5" ON "cierres_caja"  ("fecha") `);
        await queryRunner.query(`ALTER TABLE "movimientos_caja" ADD "cierreId" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_d138374d54efa404e03aebe03c" ON "movimientos_caja"  ("cierreId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d138374d54efa404e03aebe03c"`);
        await queryRunner.query(`ALTER TABLE "movimientos_caja" DROP COLUMN "cierreId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0fcbb9f42ca1ed46f5067534c5"`);
        await queryRunner.query(`DROP TABLE "cierres_caja"`);
    }

}
