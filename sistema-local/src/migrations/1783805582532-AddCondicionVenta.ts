import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCondicionVenta1783805582532 implements MigrationInterface {
    name = 'AddCondicionVenta1783805582532'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" ADD "condicionVenta" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" DROP COLUMN "condicionVenta"`);
    }

}
