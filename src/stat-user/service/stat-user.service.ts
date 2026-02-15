import { Injectable, Inject } from '@nestjs/common';
import { Media } from 'src/media/dto/media.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { StatState } from '../dto/stat-state.enum';
import { StatUser } from '../dto/stat-user.enum';
import { MediaService } from 'src/media/service/media.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Selection } from 'src/selection/dto/selection.interface';
import { SelectionType } from 'src/selection/dto/selection-type.enum';

@Injectable()
export class StatUserService {


    private readonly minimumRate: number = 92;

    constructor(@Inject(DATABASE_POOL) private pool: mariadb.Pool,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService) {
    }

    public getQuerySelectMediaInProgress(): string {
        return `
        SELECT 
        ${this.mediaService.getQuerySelectManyMedia(`ORDER BY su.lastUpdated desc`)} AS media
        FROM (
            SELECT
                su.userId,
                COALESCE(s.id, su.movieId) AS mediaId,
                MAX(su.updatedAt) AS lastUpdated
            FROM Stat_User su
            LEFT JOIN Episode e ON e.id = su.episodeId
            LEFT JOIN Media s ON s.id = e.seriesId
            WHERE su.userId = ?
            GROUP BY su.userId, mediaId
        ) su
        JOIN media m ON m.id = su.mediaId
        ${this.mediaService.getQueryJoinMedia()}
        GROUP BY su.userId`
    }

    public async getMediaSelectionInProgess(userId: number, conn: mariadb.Connection): Promise<Selection | null> {
        try {
            const query: string = this.getQuerySelectMediaInProgress();
            const results: any[] = await conn.query(query, [userId, userId]);
            if (results.length > 0) {
                const medias: Media[] = results[0].media;
                medias.forEach((media: Media, index) => {
                    if (media.mediaType === MediaType.MOVIE) {
                        medias[index] = this.movieService.getFormatedMovie(media);
                    } else if (media.mediaType === MediaType.SERIES) {
                        medias[index] = this.seriesService.getFormatedSeries(media);
                    }
                });
                return {
                    id: userId,
                    name: 'Vue récemment',
                    selectionType: SelectionType.NORMAL_POSTER,
                    mediaList: medias
                };
            } else {
                return null;
            }
        } catch (error) {
            throw error;
        }
    }

    public async saveStatUserForMovie(userId: number, movieId: number, watchProgress: number): Promise<void> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();

            const newState = watchProgress >= this.minimumRate ? StatState.FINISHED : StatState.IN_PROGRESS;

            const statInProgress: StatUser[] = await conn.query(
                `SELECT * FROM Stat_User WHERE userId = ? AND movieId = ? AND state = ?`,
                [userId, movieId, StatState.IN_PROGRESS]
            );

            if (statInProgress.length > 0) {
                const queryUpdate: string = `
                UPDATE Stat_User
                SET watchProgress = ?, state = ?
                WHERE id = ?`;
                await conn.query(queryUpdate, [watchProgress, newState, statInProgress[0].id]);
            } else {
                const statFinishedToday: StatUser[] = await conn.query(
                    `SELECT * FROM Stat_User 
                 WHERE userId = ? 
                 AND movieId = ? 
                 AND state = ? 
                 AND DATE(updatedAt) = CURDATE()`,
                    [userId, movieId, StatState.FINISHED]
                );

                if (statFinishedToday.length === 0) {
                    const queryInsert: string = `
                    INSERT INTO Stat_User (userId, movieId, state, watchProgress) 
                    VALUES (?, ?, ?, ?)`;

                    await conn.query(queryInsert, [userId, movieId, newState, watchProgress]);
                } else {
                    const queryUpdateFinished: string = `
                    UPDATE Stat_User
                    SET watchProgress = ?, state = ?
                    WHERE id = ?`
                    await conn.query(queryUpdateFinished, [watchProgress, newState, statFinishedToday[0].id]);
                }
            }

            await conn.commit();
        } catch (error) {
            await conn.rollback();
        } finally {
            await conn.release();
        }
    }

    public async saveStatUserForEpisode(userId: number, episodeId: number, watchProgress: number): Promise<void> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();

            const newState = watchProgress >= this.minimumRate ? StatState.FINISHED : StatState.IN_PROGRESS;

            const statInProgress: StatUser[] = await conn.query(
                `SELECT * FROM Stat_User WHERE userId = ? AND episodeId = ? AND state = ?`,
                [userId, episodeId, StatState.IN_PROGRESS]
            );

            if (statInProgress.length > 0) {
                const queryUpdate: string = `
                UPDATE Stat_User
                SET watchProgress = ?, state = ?
                WHERE id = ?`;
                await conn.query(queryUpdate, [watchProgress, newState, statInProgress[0].id]);
            } else {
                const statFinishedToday: StatUser[] = await conn.query(
                    `SELECT * FROM Stat_User 
                 WHERE userId = ? 
                 AND episodeId = ? 
                 AND state = ? 
                 AND DATE(updatedAt) = CURDATE()`,
                    [userId, episodeId, StatState.FINISHED]
                );

                if (statFinishedToday.length === 0) {
                    const queryInsert: string = `
                    INSERT INTO Stat_User (userId, episodeId, state, watchProgress) 
                    VALUES (?, ?, ?, ?)`;

                    await conn.query(queryInsert, [userId, episodeId, newState, watchProgress]);
                } else {
                    const queryUpdateFinished: string = `
                    UPDATE Stat_User
                    SET watchProgress = ?, state = ?
                    WHERE id = ?`
                    await conn.query(queryUpdateFinished, [watchProgress, newState, statFinishedToday[0].id]);
                }
            }
            await conn.commit();
        } catch (error) {
            await conn.rollback();
        } finally {
            await conn.release();
        }
    }

}
