import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { Version } from '../dto/version.interface';
import { OS } from '../dto/os.enum';

@Injectable()
export class VersionService {

    constructor( @Inject(DATABASE_POOL) private readonly pool: mariadb.Pool) { }

    public async getLastVersionByOS(OS: OS): Promise<Version | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `
                SELECT * FROM VERSION
                WHERE OS = ?
                ORDER BY updatedAt desc
                LIMIT 1;`
            const results: Version[] = await conn.query(query, [OS]);
            if (results.length > 0) {
                return results[0];
            } else {
                return null;
            }
        } catch(error) {
            return null
        } finally {
            await conn.release();
        }
    }

    public async getAllLastVersion(): Promise<Version[]> {
        const conn = await this.pool.getConnection();
        try {
            const query = `
                SELECT id, num, os, link, createdAt, updatedAt
                FROM (
                    SELECT *,
                        ROW_NUMBER() OVER (PARTITION BY os ORDER BY createdAt DESC) AS rn
                    FROM Version
                ) t
                WHERE rn = 1;`
            const versions: Version[] = await conn.query(query);
            return versions;
        } catch(error) {
            return [];
        } finally {
            await conn.release();
        }
    }

}
