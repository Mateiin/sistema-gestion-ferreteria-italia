import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCuentaCorriente1783881494156 implements MigrationInterface {
    name = 'AddCuentaCorriente1783881494156'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "movimientos_cta_cte" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clienteId" uuid NOT NULL, "tipo" character varying NOT NULL, "monto" numeric(15,2) NOT NULL, "fecha" date NOT NULL, "comprobanteId" uuid, "descripcion" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f1da983bedd42e39825d61592fd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_927e36d1be8454dc6e0bf35d24" ON "movimientos_cta_cte"  ("clienteId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_927e36d1be8454dc6e0bf35d24"`);
        await queryRunner.query(`DROP TABLE "movimientos_cta_cte"`);
    }

}
