import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceptorRazonSocialDomicilio1783881211601 implements MigrationInterface {
    name = 'AddReceptorRazonSocialDomicilio1783881211601'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" ADD "razonSocialReceptor" character varying`);
        await queryRunner.query(`ALTER TABLE "comprobantes" ADD "domicilioReceptor" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comprobantes" DROP COLUMN "domicilioReceptor"`);
        await queryRunner.query(`ALTER TABLE "comprobantes" DROP COLUMN "razonSocialReceptor"`);
    }

}
