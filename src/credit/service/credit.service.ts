import { Injectable } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { Job } from '../dto/job.enum';
import { Credit } from '../dto/credit.interface';

@Injectable()
export class CreditService {


    public getQueryOrderCredit(table: string): string {
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

    public getQuerySelectCredits(): string {
        return `'credits', cre.credits,`;
    }

    public getQueryJoinCredits(): string {
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
                                'srcPoster', p.name,
                                'order', mcr.\`order\`
                            )
                            ${this.getQueryOrderCredit('mcr')}
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

    public async insertManyCredits(mediaId: number, credits: Credit[], conn: mariadb.PoolConnection): Promise<string> {
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
                        c.fullName,
                        c.originalFullName
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
                    c.character ?? null,
                    c.order ?? -1
                );
            });

            if (!mediaCreditValues.length) {
                await conn.rollback();
                return "Aucun acteur ou réalisateur n'est à ajouter";
            }

            const rowsMediaCredit = mediaCreditValues.length / 5;

            const result: any = await conn.query(
                `
                INSERT IGNORE INTO Media_Credit (
                    mediaId,
                    creditId,
                    job,
                    \`character\`,
                    \`order\`
                )
                VALUES ${Array(rowsMediaCredit).fill("(?, ?, ?, ?, ?)").join(",")}
                `,
                mediaCreditValues
            );

            return `Les crédits ont été ajoutés (${result.affectedRows})`;

        } catch (error) {
            throw error;
        }
    }

    public async deleteAndUpdateMediaCredit(mediaId: number, credits: Credit[], conn: mariadb.PoolConnection): Promise<string> {
        try {
            await conn.query(`DELETE FROM Media_Credit WHERE mediaId = ?`, [mediaId]);
            return await this.insertManyCredits(mediaId, credits, conn);
        } catch (error) {
            throw error;
        }
    }

}
