import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDetalleComprobante1783788854025 implements MigrationInterface {
    name = 'AddDetalleComprobante1783788854025'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" ADD "detalle" jsonb`);
        await queryRunner.query(`ALTER TABLE "comprobantes" ADD "fecha" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" DROP COLUMN "fecha"`);
        await queryRunner.query(`ALTER TABLE "comprobantes" DROP COLUMN "detalle"`);
    }

}
