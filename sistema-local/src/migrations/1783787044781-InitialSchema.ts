import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783787044781 implements MigrationInterface {
    name = 'InitialSchema1783787044781'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "comprobantes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "emisorId" character varying NOT NULL, "tipoComprobante" integer NOT NULL, "puntoVenta" integer NOT NULL, "numero" integer NOT NULL, "docTipoReceptor" integer NOT NULL, "docNroReceptor" bigint NOT NULL, "importeNeto" numeric(15,2) NOT NULL, "importeIva" numeric(15,2) NOT NULL, "importeTotal" numeric(15,2) NOT NULL, "condicionIvaReceptor" character varying, "ivaDesglose" jsonb, "cae" character varying NOT NULL, "vencimientoCae" character varying NOT NULL, "ventaId" character varying, "comprobanteOriginalId" character varying, "estado" character varying NOT NULL DEFAULT 'autorizado', "emitidoEl" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0c3ac75b725717ec0f082ece89b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d2a19fa33e8ac523d9b59c096e" ON "comprobantes"  ("emisorId", "puntoVenta", "tipoComprobante", "numero") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d2a19fa33e8ac523d9b59c096e"`);
        await queryRunner.query(`DROP TABLE "comprobantes"`);
    }

}
