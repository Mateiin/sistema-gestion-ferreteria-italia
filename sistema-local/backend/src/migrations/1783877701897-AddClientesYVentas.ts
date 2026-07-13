import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClientesYVentas1783877701897 implements MigrationInterface {
    name = 'AddClientesYVentas1783877701897'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "razonSocial" character varying NOT NULL, "docTipo" integer NOT NULL, "docNro" bigint NOT NULL, "condicionIva" character varying NOT NULL, "domicilio" character varying, "email" character varying, "telefono" character varying, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "lineas_venta" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ventaId" uuid NOT NULL, "descripcion" character varying NOT NULL, "cantidad" numeric(15,3) NOT NULL, "precioUnitario" numeric(15,2) NOT NULL, "ivaPorcentaje" numeric(5,2) NOT NULL DEFAULT '21', "unidadMedida" integer NOT NULL DEFAULT '7', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_aa9f1d648bb8e8d64f7ee30decc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ventas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clienteId" uuid NOT NULL, "estado" character varying NOT NULL DEFAULT 'ABIERTA', "comprobanteId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b8b73abe8561829c019531d9a2e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3be0bdfc5c1766a0418b076118" ON "ventas"  ("clienteId") WHERE estado = 'ABIERTA'`);
        await queryRunner.query(`ALTER TABLE "lineas_venta" ADD CONSTRAINT "FK_29307a96e3da0b43bb842b98148" FOREIGN KEY ("ventaId") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ventas" ADD CONSTRAINT "FK_771620ab33741414f8248217fc3" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_771620ab33741414f8248217fc3"`);
        await queryRunner.query(`ALTER TABLE "lineas_venta" DROP CONSTRAINT "FK_29307a96e3da0b43bb842b98148"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3be0bdfc5c1766a0418b076118"`);
        await queryRunner.query(`DROP TABLE "ventas"`);
        await queryRunner.query(`DROP TABLE "lineas_venta"`);
        await queryRunner.query(`DROP TABLE "clientes"`);
    }

}
