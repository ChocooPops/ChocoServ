import { forwardRef, Inject, Injectable  } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { Job } from '../dto/job.enum';
import { MediaCredit } from '../dto/media-credit.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterService } from 'src/poster/service/poster.service';
import { DATABASE_POOL } from 'src/database/database.module';
import { Movie } from 'src/movie/dto/movie.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Series } from 'src/series/dto/series.interface';
import { Credit } from '../dto/credit.interface';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { TmdbService } from 'src/tmdb/service/tmdb.service';

@Injectable()
export class CreditService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly posterService: PosterService,
        private readonly uploadImageService: UploadImageService,
        @Inject(forwardRef(() => TmdbService))
        private readonly tmdbService: TmdbService
    ) { }
    
    public getJobToFilters(): Job[] {
        return [
            Job.ACTOR,
            Job.DIRECTOR,
            Job.CREATOR,
            Job.PRODUCER,
            Job.DIRECTOR_OF_PHOTOGRAPHY,
            Job.ORIGINAL_MUSIC_COMPOSER,
            Job.WRITER,
            Job.STORY,
            Job.SCREENPLAY,
            Job.COMIC_BOOK,
            Job.ORIGINAL_STORY,
            Job.VISUAL_EFFECTS_TECHNICAL_DIRECTOR
        ]
    }

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
                OR c.originalFullName like '%${keyWord}%
                ORDER BY ABS(CHAR_LENGTH(c.fullName) - CHAR_LENGTH(${keyWord})), 
                    ABS(CHAR_LENGTH(c.originalFullName) - CHAR_LENGTH(${keyWord})) ASC'
                LIMIT 50`);
            credits.forEach((credit: Credit) => {
                credit.srcPoster = this.formatPathService.getOneFormatedPosterUrl(credit.id, MediaType.CREDIT, credit.srcPoster as string);
            });
            return credits;
        } catch(error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getCreditById(creditId: number): Promise<Credit | null> {
        const conn = await this.pool.getConnection();
        try {
            const credits: Credit[] = await conn.query(`
                SELECT
                c.id, c.tmdbId, c.fullName, c.originalFullName, p.name as srcPoster
                FROM CREDIT c
                LEFT JOIN Poster p ON p.id = c.srcPoster 
                WHERE c.id = ?`, [creditId]);
            const credit: Credit = credits[0];
            credit.srcPoster = this.formatPathService.getOneFormatedPosterUrl(credit.id, MediaType.CREDIT, credit.srcPoster as string);
            return credit;
        } catch(error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public getQueryOrderCreditForMovie(table: string): string {
        return `
                ORDER BY
                    CASE ${table}.job
                        WHEN 'ACTOR' THEN 1
                        WHEN 'DIRECTOR' THEN 2
                        WHEN 'CREATOR' THEN 3
                        WHEN 'PRODUCER' THEN 4
                        WHEN 'DIRECTOR OF PHOTOGRAPHY' THEN 5
                        WHEN 'ORIGINAL MUSIC COMPOSER' THEN 6
                        WHEN 'WRITER' THEN 7
                        WHEN 'ORIGINAL STORY' THEN 8
                        WHEN 'STORY' THEN 9
                        WHEN 'SCREENPLAY' THEN 10
                        WHEN 'COMIC BOOK' THEN 11
                        WHEN 'VISUAL EFFECTS TECHNICAL DIRECTOR' THEN 12
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
                        WHEN 'CREATOR' THEN 2
                        WHEN 'WRITER' THEN 3
                        WHEN 'STORY' THEN 4
                        WHEN 'COMIC BOOK' THEN 5
                        WHEN 'ORIGINAL STORY' THEN 6
                        WHEN 'DIRECTOR' THEN 7
                        WHEN 'PRODUCER' THEN 8
                        WHEN 'DIRECTOR OF PHOTOGRAPHY' THEN 9
                        WHEN 'ORIGINAL MUSIC COMPOSER' THEN 10
                        WHEN 'SCREENPLAY' THEN 11
                        WHEN 'VISUAL EFFECTS TECHNICAL DIRECTOR' THEN 12
                        ELSE 999
                        END ASC,
                    ${table}.episodeCount DESC,
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
                        const formatedPath: string = creditId.toString();
                        const poster: any = await this.tmdbService.getEntirelyUrlImagesFromTMDB(newCredit.srcPoster);
                        await this.posterService.insertPosterCredit(poster, creditId, formatedPath, conn);
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

    public async addNewCredit(newCredit: Credit): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const credits: Credit[] = await conn.query(`SELECT id FROM Credit WHERE tmdbID = ?`, [newCredit.tmdbId]);
            if (credits.length <= 0) {
                const fullName: string | null = newCredit.fullName?.trim();
                if (fullName) {
                    const insertCredit = await conn.query(`
                        INSERT INTO Credit
                        (tmdbId, fullName, originalFullName)
                        VALUES (?, ?, ?)`,
                    [newCredit.tmdbId, fullName, newCredit.originalFullName?.trim()]);
                    const creditId: number | null = insertCredit ? Number(insertCredit.insertId) : null;
                    if (creditId) {
                        const formatedPath: string = creditId.toString();
                        const messagePoster: string = await this.posterService.insertPosterCredit(newCredit.srcPoster, creditId, formatedPath, conn);
                        await conn.commit();
                        return {
                            id: 0,
                            state: true,
                            message: `Le crédit a été inséré \n ${messagePoster}`,
                            other: { id: creditId }
                        }
                    } else {
                        return {
                            id: -1,
                            state: false,
                            message: `Erreur: Echec de l'enregistrement du film`
                        }
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: `Le nom complet du crédit ne doit pas être vide`
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: `L'id TMDB est déjà référencé, il doit être unique`
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async modifyCredit(updateCredit: Credit): Promise<any> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const oldCredit: Credit = await this.getCreditById(updateCredit.id);
            if (oldCredit && oldCredit.id) {
                const creditIfExits: Credit[] = await conn.query(`SELECT id FROM Credit WHERE tmdbId = ? AND id != ?`, [updateCredit.tmdbId, updateCredit.id]);
                if (creditIfExits.length <= 0) {
                    const newFullName: string | null = updateCredit.fullName?.trim();
                    if (newFullName) {
                        await conn.query(`
                            UPDATE Credit
                            SET tmdbId = ?, fullName = ?, originalFullName = ?
                            WHERE id = ?`,
                        [updateCredit.tmdbId, updateCredit.fullName, updateCredit.originalFullName, updateCredit.id]);
                        
                        const formatedPath: string = oldCredit.id.toString();

                        const messagePoster: string = await this.posterService.modifyOrDeletePosterFromCredit(updateCredit.id, updateCredit.srcPoster, oldCredit.srcPoster as string, formatedPath, conn);
                        
                        await conn.commit();
                        return {
                            id: 0,
                            state: true,
                            message: `Le crédit a été modifié \n ${messagePoster}`,
                            other: { id: updateCredit.id }
                        }
                    } else {
                        return {
                            id: -1,
                            state: false,
                            message: `Le nom du crédit ne doit pas être vide`
                        }
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: `L'id TMDB est déjà référencé, il doit être unique`
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: 'Crédit introuvable'
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async deleteCreditById(creditId: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const credits: Credit[] = await conn.query(`SELECT id, fullName, srcPoster FROM Credit WHERE id = ?`, [creditId]);
            if (credits.length > 0) {
                const formatedPath: string = creditId.toString();
                const mediaCredits = await conn.query(`DELETE FROM Media_Credit WHERE creditId = ?`, [creditId]);
                const poster = await conn.query(`DELETE FROM Poster WHERE id = ?`, [credits[0].srcPoster]);
                const credit = await conn.query(`DELETE FROM Credit WHERE id = ?`, [creditId]);
                await this.uploadImageService.deleteFileOrDirectoryToCredit(formatedPath);
                await conn.commit();
                return {
                    id: 0,
                    state: true,
                    message: `Credit lié aux médias (${mediaCredits.affectedRows} supprimé) \n Poster supprimé (${poster.affectedRows}) \n Crédit ${credits[0].fullName} supprimé`
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: 'Credit introuvable'
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async saveAllNewCreditFromAllMedia(): Promise<any> {
        const conn = await this.pool.getConnection();
        const results: any[] = [];

        const movies: Movie[] = await conn.query(`SELECT id, title, mediaLibraryId FROM Media WHERE mediaType = ?`, [MediaType.MOVIE]);
        for (const movie of movies) {
            try {
                const credits: MediaCredit[] = await this.tmdbService.fetchCreditForMovie(movie);
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

        const series: Series[] = await conn.query(`SELECT id, title, mediaLibraryId FROM Media WHERE mediaType = ?`, [MediaType.SERIES]);
        for (const serie of series) {
            try {
                const credits: MediaCredit[] = await this.tmdbService.fetchCreditForSeries(serie);
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
