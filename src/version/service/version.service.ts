import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { Version } from '../dto/version.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { OS } from '../dto/os.enum';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class VersionService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly i18nService: I18nService) { }

    public async getLastVersionByOS(OS: OS, conn: mariadb.PoolConnection | null = null): Promise<Version | null> {
        const query: string = `
            SELECT * FROM VERSION
            WHERE OS = ?
            ORDER BY updatedAt desc
            LIMIT 1;`
        if (conn) {
            try {
                const results: Version[] = await conn.query(query, [OS]);
                if (results.length > 0) {
                    return results[0];
                } else {
                    return null;
                }
            } catch(error) {
                return null;
            }
        } else {
            conn = await this.pool.getConnection();
            try {
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
    }

    public async getAllLastVersion(): Promise<Version[]> {
        const conn = await this.pool.getConnection();
        try {
            const query = `
                SELECT id, num, os, link, createdAt, updatedAt
                FROM (
                    SELECT *,
                        ROW_NUMBER() OVER (PARTITION BY os ORDER BY updatedAt DESC) AS rn
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

    public async updateVersionByOs(version: Version): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const osValue: OS[] = Object.values(OS);
            if (osValue.find((item) => item === version.os)) {
                if (this.isValidVersion(version.num)) {
                    const currentOS = await this.getLastVersionByOS(version.os, conn);
                    let query = "";
                    if (currentOS) {
                        query = `
                            UPDATE VERSION
                            SET NUM = ?, LINK = ?
                            WHERE OS = ?`;
                    } else {
                        query = `
                        INSERT INTO VERSION
                        (NUM, LINK, OS)
                        VALUES (?, ?, ?)`;
                    }
                    await conn.query(query, [version.num.trim(), version.link?.trim() ?? '', version.os]);
                    await conn.commit();
                    const lastVersion = await this.getLastVersionByOS(version.os, conn);
                    return {
                        id: 0,
                        state: true,
                        message: this.i18nService.t("common.VERSION.UPDATE_COMPLETED"),
                        other: lastVersion
                    }
                } else {
                    return {
                        id: -1,
                        message: this.i18nService.t("common.VERSION.INCORRECT_VERSION_FORMAT"),
                        state: false
                    }
                }
            } else {
                return {
                    id: -1,
                    message: this.i18nService.t("common.VERSION.INCORRECT_OS"),
                    state: false
                }
            }
        } catch(error) {
            await conn.rollback();
            throw error;
        } finally {
            await conn.release();
        }
    }

    isValidVersion(version: string): boolean {
        return /^\d+(\.\d+)+$/.test(version.trim());
    }

}
