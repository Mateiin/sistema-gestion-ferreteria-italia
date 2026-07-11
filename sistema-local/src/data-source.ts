import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource para la CLI de TypeORM (migration:generate/run/revert). Lee las
 * MISMAS variables de entorno que usa la app (ver AppModule) para que la
 * migración se genere/corra contra la misma base. No lo usa la app en
 * runtime: NestJS arma su propia conexión vía TypeOrmModule.forRootAsync.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'ferreteria_local',
  synchronize: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
