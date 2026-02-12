import { Injectable, Inject } from '@nestjs/common';
import { Media } from 'src/media/dto/media.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { StatState } from '../dto/stat-state.enum';
import { StatUser } from '../dto/stat-user.enum';

@Injectable()
export class StatUserService {

    constructor(@Inject(DATABASE_POOL) private pool: mariadb.Pool) {
    }

    public async getMediaidInProgressByUserId(userId: number): Promise<Media[]> {
        return [];
    }

    public async saveStatUserForMovie(userId: number, movieId: number, watchProgress: number) : Promise<void> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const stat: StatUser[] = await conn.query(`SELECT * FROM Stat_User WHERE userId = ? AND movieId = ? AND state = ?`, [userId, movieId, StatState.IN_PROGRESS]);
            if (stat.length > 0) {
                const queryUpdate: string = `
                    UPDATE Stat_User
                    SET watchProgress = ?
                    WHERE id = ?`;
                await conn.query(queryUpdate, [watchProgress, stat[0].id]);
            } else {
                const queryInsert: string = `
                    INSERT INTO Stat_User (userId, movieId, state, watchProgress) VALUES (?, ?, ?, ?)`;
                
                await conn.query(queryInsert, [userId, movieId, StatState.IN_PROGRESS, watchProgress]);
            }
            await conn.commit();
        } catch(error) {
            await conn.rollback();
        } finally {
            await conn.release();
        }
    }

    public async saveStatUserForEpisode(userId: number, movieId: number, watchProgress: number): Promise<void> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();

        } catch(error) {
            await conn.rollback();
        } finally {
            await conn.release();
        }
    }

}
