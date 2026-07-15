import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTipoMovimientoCaja1784073377733 implements MigrationInterface {
    name = 'AddTipoMovimientoCaja1784073377733'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movimientos_caja" ADD "tipo" character varying NOT NULL DEFAULT 'VENTA'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "movimientos_caja" DROP COLUMN "tipo"`);
    }

}
