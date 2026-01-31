import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as mariadb from 'mariadb';

export const DATABASE_POOL = 'DATABASE_POOL';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const pool = mariadb.createPool({
          host: config.get('DB_HOST'),
          port: +config.get('DB_PORT'),
          user: config.get('DB_USER'),
          password: config.get('DB_PASS'),
          database: config.get('DB_NAME'),
          connectionLimit: +config.get('DB_CONNECTION_LIMIT'),
        });
        // Optionally test connection
        // const conn = await pool.getConnection();
        // await conn.release();
        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule { }