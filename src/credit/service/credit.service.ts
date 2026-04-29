import { Inject, Injectable  } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { Job } from '../dto/job.enum';
import { MediaCredit } from '../dto/media-credit.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterService } from 'src/poster/service/poster.service';
import { LazyModuleLoader } from '@nestjs/core';
import { TmdbService } from 'src/tmdb/service/tmdb.service';
import { DATABASE_POOL } from 'src/database/database.module';
import { Movie } from 'src/movie/dto/movie.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Series } from 'src/series/dto/series.interface';
import { Credit } from '../dto/credit.interface';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { ReturnMessage } from 'src/common-interface/return-message.interface';

@Injectable()
export class CreditService {

    private tmdbService: TmdbService | null = null;

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly lazyModuleLoader: LazyModuleLoader,
        private readonly formatPathService: FormatPathService,
        private readonly posterService: PosterService,
        private readonly uploadImageService: UploadImageService
    ) { }
    
    public async getCreditByResearch(keyWord: string): Promise<Credit[]> {
        const conn = await this.pool.getConnection();
        try {
            const credits: Credit[] = await conn.query(`
                SELECT c.id, p.name as srcPoster, c.fullName 
                FROM CREDIT c
                LEFT JOIN Poster p ON p.id = c.srcPoster
                WHERE c.id like '${keyWord}%'
                OR c.tmdbId like '${keyWord}%'
                OR c.fullName like '%${keyWord}%' 
                OR c.originalFullName like '%${keyWord}%'
                LIMIT 50`);
            credits.forEach((credit: Credit) => {
                credit.srcPoster = this.formatPathService.getOneFormatedPosterUrlFromCredit(credit.id, credit.fullName, credit.srcPoster as string);
            });
            return credits;
        } catch(error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getCreditById(creditId: number): Promise<Credit> {
        const conn = await this.pool.getConnection();
        try {
            const credits: Credit[] = await conn.query(`
                SELECT
                c.id, c.tmdbId, c.fullName, c.originalFullName, p.name as srcPoster
                FROM CREDIT c
                LEFT JOIN Poster p ON p.id = c.srcPoster 
                WHERE c.id = ?`, [creditId]);
            const credit: Credit = credits[0];
            credit.srcPoster = this.formatPathService.getOneFormatedPosterUrlFromCredit(credit.id, credit.fullName, credit.srcPoster as string);
            return credit;
        } catch(error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    private async getTmdbService() {
        if (!this.tmdbService) {
            const { TmdbModule } = await import('../../tmdb/tmdb.module');
        const { TmdbService } = await import('../../tmdb/service/tmdb.service');
            const moduleRef = await this.lazyModuleLoader.load(() => TmdbModule);
            this.tmdbService = moduleRef.get(TmdbService);
        }
        return this.tmdbService;
    }

    public getQueryOrderCreditForMovie(table: string): string {
        return `
                ORDER BY
                    CASE ${table}.job
                        WHEN 'ACTOR' THEN 1
                        WHEN 'DIRECTOR' THEN 2
                        WHEN 'PRODUCER' THEN 3
                        WHEN 'DIRECTOR_OF_PHOTOGRAPHY' THEN 4
                        WHEN 'ORIGINAL_MUSIC_COMPOSER' THEN 5
                        WHEN 'WRITER' THEN 6
                        WHEN 'STORY' THEN 7
                        WHEN 'SCREENPLAY' THEN 8
                        WHEN 'COMIC_BOOK' THEN 9
                        WHEN 'VISUAL_EFFECTS_TECHNICAL_DIRECTOR' THEN 10
                        ELSE 999
                        END ASC,
                    ${table}.\`order\` ASC
        `
    }
    public getQueryOrderCreditForSeries(table: string): string {
        return `
                ORDER BY
                    CASE ${table}.job
                        WHEN 'ACTOR' THEN 1
                        WHEN 'WRITER' THEN 2
                        WHEN 'STORY' THEN 3
                        WHEN 'COMIC_BOOK' THEN 4
                        WHEN 'DIRECTOR' THEN 5
                        WHEN 'PRODUCER' THEN 6
                        WHEN 'DIRECTOR_OF_PHOTOGRAPHY' THEN 7
                        WHEN 'ORIGINAL_MUSIC_COMPOSER' THEN 8
                        WHEN 'SCREENPLAY' THEN 9
                        WHEN 'VISUAL_EFFECTS_TECHNICAL_DIRECTOR' THEN 10
                        ELSE 999
                        END ASC,
                    ${table}.\`order\` ASC
        `
    }

    public getQuerySelectCredits(): string {
        return `'credits', cre.credits,`;
    }

    public getQueryJoinCredits(mediaType: MediaType): string {
        return `LEFT JOIN (
                    SELECT mcr.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', Credit.id,
                                'tmdbId', Credit.tmdbId,
                                'fullName', Credit.fullName,
                                'originalFullName', Credit.originalFullName,
                                'character', mcr.character,
                                'job', mcr.job,
                                'episodeCount', mcr.episodeCount,
                                'srcPoster', p.name,
                                'order', mcr.\`order\`
                            )
                            ${mediaType === MediaType.MOVIE ? this.getQueryOrderCreditForMovie('mcr') : 
                            mediaType === MediaType.SERIES ? this.getQueryOrderCreditForSeries('mcr') :
                            ''}
                        ) AS credits
                    FROM Media_Credit mcr
                    JOIN Credit ON credit.id = mcr.creditId
                    LEFT JOIN Poster p ON p.id = credit.srcPoster
                    GROUP BY mcr.mediaId
                    ORDER BY mcr.order asc
                ) cre ON cre.mediaId = m.id`;
    }

    public getJobToFilters(): Job[] {
        return [
            Job.ACTOR,
            Job.DIRECTOR,
            Job.PRODUCER,
            Job.DIRECTOR_OF_PHOTOGRAPHY,
            Job.ORIGINAL_MUSIC_COMPOSER,
            Job.WRITER,
            Job.STORY,
            Job.SCREENPLAY,
            Job.COMIC_BOOK,
            Job.VISUAL_EFFECTS_TECHNICAL_DIRECTOR
        ]
    }

    public async insertManyCredits(mediaId: number, credits: MediaCredit[], conn: mariadb.PoolConnection): Promise<string> {
        if (!credits.length) {
            return "Aucun credit n'est à ajouter";
        }

        try {
            /**
             * 1. Déduplication par tmdbId + job + character + order
             */
            const uniqueCredits = Array.from(
                new Map(
                    credits.map((credit) => [
                        `${credit.tmdbId}_${credit.job}_${credit.character ?? ""}_${credit.order ?? -1}`,
                        credit
                    ])
                ).values()
            );

            /**
             * 2. Récupérer crédits existants
             */
            const tmdbIds = [...new Set(uniqueCredits.map(c => c.tmdbId))];

            const placeholders = tmdbIds.map(() => "?").join(",");

            const existingRows: { id: number; tmdbId: number }[] =
                await conn.query(
                    `
                    SELECT id, tmdbId
                    FROM Credit
                    WHERE tmdbId IN (${placeholders})
                    `,
                    tmdbIds
                );

            const existingMap = new Map<number, number>(
                existingRows.map(row => [row.tmdbId, row.id])
            );

            /**
             * 3. Déterminer nouveaux crédits à insérer
             */
            const newCredits = uniqueCredits.filter(
                c => !existingMap.has(c.tmdbId)
            );

            /**
             * 4. Insert nouveaux crédits
             */
            if (newCredits.length > 0) {
                const insertValues: any[] = [];

                newCredits.forEach(c => {
                    insertValues.push(
                        c.tmdbId,
                        c.fullName?.trim(),
                        c.originalFullName?.trim()
                    );
                });

                const rows = newCredits.length;

                await conn.query(
                    `
                    INSERT INTO Credit (
                        tmdbId,
                        fullName,
                        originalFullName
                    )
                    VALUES ${Array(rows).fill("(?, ?, ?)").join(",")}
                    ON DUPLICATE KEY UPDATE
                        fullName = VALUES(fullName),
                        originalFullName = VALUES(originalFullName)
                    `,
                    insertValues
                );

                /**
                 * Re-fetch IDs fiables
                 */
                const insertedRows: { id: number; tmdbId: number }[] =
                    await conn.query(
                        `
                        SELECT id, tmdbId
                        FROM Credit
                        WHERE tmdbId IN (${placeholders})
                        `,
                        tmdbIds
                    );

                insertedRows.forEach(row => {
                    existingMap.set(row.tmdbId, row.id);
                });
            }

            /**
            * Ajout des posters pour les nouveaux credits
            */
           const uniqueNewCredits = Array.from(
                new Map(newCredits.map(credit => [credit.tmdbId, credit])).values()
            );
            for (const newCredit of uniqueNewCredits) {
                try {
                    const creditId: number = existingMap.get(newCredit.tmdbId);
                    if (creditId) {
                        const formatedTitle: string = `${creditId}-${this.formatPathService.formatPath(newCredit.fullName)}`
                        const tmdbService = await this.getTmdbService();
                        const poster: any = await tmdbService.getEntirelyUrlImagesFromTMDB(newCredit.srcPoster);
                        await this.posterService.insertPosterCredit(poster, creditId, formatedTitle, conn);
                    }
                } catch(error) {
                    
                }
            }

            /**
             * 5. Préparer liaison Media_Credit
             */
            const mediaCreditValues: any[] = [];

            uniqueCredits.forEach(c => {
                const creditId = existingMap.get(c.tmdbId);

                if (!creditId) return;

                mediaCreditValues.push(
                    mediaId,
                    creditId,
                    c.job,
                    c.character?.trim() ?? null,
                    c.episodeCount ?? null,
                    c.order ?? -1
                );
            });
            if (!mediaCreditValues.length) {
                await conn.rollback();
                return "Aucun acteur ou réalisateur n'est à ajouter";
            }

            const rowsMediaCredit = mediaCreditValues.length / 6;

            const result: any = await conn.query(
                `
                INSERT INTO Media_Credit (
                    mediaId,
                    creditId,
                    job,
                    \`character\`,
                    episodeCount,
                    \`order\`
                )
                VALUES ${Array(rowsMediaCredit).fill("(?, ?, ?, ?, ?, ?)").join(",")}
                `,
                mediaCreditValues
            );

            return `Les crédits ont été ajoutés (${result.affectedRows})`;

        } catch (error) {
            throw error;
        }
    }

    public async deleteAndUpdateMediaCredit(mediaId: number, credits: MediaCredit[], conn: mariadb.PoolConnection): Promise<string> {
        try {
            await conn.query(`DELETE FROM Media_Credit WHERE mediaId = ?`, [mediaId]);
            return await this.insertManyCredits(mediaId, credits, conn);
        } catch (error) {
            throw error;
        }
    }

    public async addNewCredit(newCredit: Credit): Promise<any> {
        const conn = await this.pool.getConnection();
        try {

        } catch(error) {

        } finally {
            await conn.release();
        }
    }

    public async modifyCredit(updateCredit: Credit): Promise<any> {
        const conn = await this.pool.getConnection();
        try {

        } catch(error) {

        } finally {
            await conn.release();
        }
    }

    public async deleteCreditById(creditId: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const credits: Credit[] = await conn.query(`SELECT id, fullName, srcPoster FROM Credit WHERE id = ?`, [creditId]);
            if (credits.length > 0) {
                const formatedTitle: string = this.formatPathService.getFormatedTitleForCredit(credits[0].id, credits[0].fullName);
                const mediaCredits = await conn.query(`DELETE FROM Media_Credit WHERE creditId = ?`, [creditId]);
                const poster = await conn.query(`DELETE FROM Poster WHERE id = ?`, [credits[0].srcPoster]);
                const credit = await conn.query(`DELETE FROM Credit WHERE id = ?`, [creditId]);
                await this.uploadImageService.deleteFileOrDirectoryToCredit(formatedTitle);
                return {
                    id: 0,
                    state: true,
                    message: `Credit lié aux médias (${mediaCredits.affectedRows} supprimé) \n Poster supprimé (${poster.affectedRows}) \n Crédit ${credit[0].fullName} supprimé`
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: 'Credit introuvable'
                }
            }
        } catch(error) {

        } finally {
            await conn.release();
        }
    }

    public async saveAllNewCreditFromAllMedia(): Promise<any> {
        const conn = await this.pool.getConnection();
        const tmdbService = await this.getTmdbService();
        const results: any[] = [];

        const movies: Movie[] = await conn.query(`SELECT id, title, jellyfinId FROM Media WHERE mediaType = ?`, [MediaType.MOVIE]);
        for (const movie of movies) {
            try {
                const credits: MediaCredit[] = await tmdbService.fetchCreditForMovie(movie);
                const message = await this.deleteAndUpdateMediaCredit(movie.id, credits, conn);
                results.push(`${movie.title} => ${message}`);
                console.log(`${movie.title} => ${message}`);
            } catch(error) {
                results.push({
                    title: movie.title,
                    error : error
                })
                console.log(`${movie.title} => error`);
            }
        }

        const series: Series[] = await conn.query(`SELECT id, title, jellyfinId FROM Media WHERE mediaType = ?`, [MediaType.SERIES]);
        for (const serie of series) {
            try {
                const credits: MediaCredit[] = await tmdbService.fetchCreditForSeries(serie);
                const message = await this.deleteAndUpdateMediaCredit(serie.id, credits, conn);
                results.push(`${serie.title} => ${message}`);
                console.log(`${serie.title} => ${message}`);
            } catch(error) {
                results.push({
                    title: serie.title,
                    error : error
                });
                console.log(`${serie.title} => error`);
            }
        }
        await conn.release();
        return results;
    }

}
