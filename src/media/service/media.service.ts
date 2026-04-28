import { Injectable, Inject } from '@nestjs/common';
import { TranslationTitle } from '../dto/translation-title.interface';
import * as mariadb from 'mariadb';
import { CategorySimple } from 'src/category/dto/categorySimple.interface';
import { MediaType } from '../dto/media-type.enum';
import { SearchService } from 'src/common-service/search.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { SearchItem } from 'src/common-interface/search-item.interface';
import { Media } from '../dto/media.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterService } from 'src/poster/service/poster.service';
import { Node } from 'src/common-interface/node.interface';
import { StatState } from 'src/stat-user/dto/stat-state.enum';
import { SortCatalog } from '../dto/sort-catalog.enum';
import { CreditService } from 'src/credit/service/credit.service';
import { Job } from 'src/credit/dto/job.enum';

@Injectable()
export class MediaService {

    protected currentMediaType !: MediaType;

    constructor(@Inject(DATABASE_POOL) protected readonly pool: mariadb.Pool,
        private readonly searchService: SearchService,
        protected readonly verifTimerShowService: VerifTimerShowService,
        protected readonly formatPathService: FormatPathService,
        protected readonly posterService: PosterService,
        protected readonly creditService: CreditService
    ) { }

    protected async getNodesMediaByType(): Promise<Node[]> {
        const conn = await this.pool.getConnection();
        try {
            const nodes: Node[] = await conn.query(`SELECT id, title as name FROM Media WHERE mediaType = ?`, [this.currentMediaType]);
            return nodes;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getSimpleMediaById(mediaId: number): Promise<Media | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT * FROM Media WHERE id = ?`;
            const result: Media[] = await conn.query(query, [mediaId]);
            return result[0] ?? null;
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    public getQuerySelectOneMedia(ORDER: string = ''): string {
        return `
            JSON_OBJECT(
                'id', m.id,
                'title', m.title,
                'description', m.description,
                'date', m.date,
                'time', m.time,
                'quality', m.quality,
                'startShow', m.startShow,
                'endShow', m.endShow,

                'keyWords', kw.keywords,

                'srcLogo', pl.name,
                'srcBackgroundImage', pb.name,

                'srcPoster', JSON_OBJECT(
                    'normal', posters.normal,
                    'special', posters.special,
                    'license', posters.license,
                    'horizontal', posters.horizontal
                ),

                'mediaType', m.mediaType,
                
                'watchProgress', 
                CASE
                    WHEN m.mediaType = 'MOVIE' THEN IFNULL(su2.watchProgress, 0)
                    ELSE NULL
                END,

                'stateProgress', 
                CASE
                    WHEN m.mediaType = 'MOVIE' THEN IFNULL(su2.state, '${StatState.NOT_WATCHED}')
                    ELSE NULL
                END,

                'seasons',
                CASE
                    WHEN m.mediaType = 'SERIES' THEN seas.seasons
                    ELSE NULL
                END
            )
            ${ORDER}`
    }

    public getQuerySelectManyMedia(ORDER: string = ''): string {
        return `JSON_ARRAYAGG(
                    ${this.getQuerySelectOneMedia(ORDER)}
                )`
    }

    public getQueryJoinMedia(): string {
        return `
            LEFT JOIN (
                SELECT mediaId, JSON_ARRAYAGG(name) AS keywords
                FROM (
                    SELECT mediaId, name,
                        ROW_NUMBER() OVER (
                            PARTITION BY mediaId 
                            ORDER BY RAND()
                        ) AS rn
                    FROM keyword
                ) ranked
                WHERE rn <= 3
                GROUP BY mediaId
            ) kw ON kw.mediaId = m.id

            LEFT JOIN poster pl ON pl.id = m.srcLogo
            LEFT JOIN poster pb ON pb.id = m.srcBackground

            LEFT JOIN (
                SELECT
                    mp.mediaId,
                    JSON_ARRAYAGG(CASE WHEN mp.type = 'NORMAL' THEN p.name END)     AS normal,
                    JSON_ARRAYAGG(CASE WHEN mp.type = 'SPECIAL' THEN p.name END)    AS special,
                    JSON_ARRAYAGG(CASE WHEN mp.type = 'LICENSE' THEN p.name END)    AS license,
                    JSON_ARRAYAGG(CASE WHEN mp.type = 'HORIZONTAL' THEN p.name END) AS horizontal
                FROM media_poster mp
                JOIN poster p ON p.id = mp.posterId
                GROUP BY mp.mediaId
            ) posters ON posters.mediaId = m.id

            LEFT JOIN (
                SELECT
                    s.seriesId AS mediaId,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', s.id,
                            'seriesId', s.seriesId,
                            'jellyfinId', s.jellyfinId,
                            'name', s.name,
                            'seasonNumber', s.seasonNumber,
                            'srcPoster', sp.name
                        )
                        ORDER BY s.seasonNumber
                    ) AS seasons
                FROM season s
                LEFT JOIN poster sp ON sp.id = s.srcPoster
                GROUP BY s.seriesId
            ) seas ON seas.mediaId = m.id
             
            LEFT JOIN (
                SELECT 
                    su.movieId,
                    su.watchProgress,
                    su.state,
                    su.updatedAt
                FROM Stat_User su
                INNER JOIN (
                    SELECT 
                        movieId,
                        userId,
                        MAX(updatedAt) AS max_updated
                    FROM Stat_User
                    WHERE userId = ? AND movieId IS NOT NULL
                    GROUP BY movieId, userId
                ) latest ON su.movieId = latest.movieId 
                        AND su.userId = latest.userId 
                        AND su.updatedAt = latest.max_updated
                WHERE su.userId = ?
            ) su2 ON su2.movieId = m.id`
    }

    private getQuerySelectMedia(JOIN: string, WHERE: string, ORDER: string, LIMIT: string): string {
        return `
        SELECT
            ${this.getQuerySelectOneMedia()} AS media
            FROM media m
            ${this.getQueryJoinMedia()}
        ${JOIN}
        ${WHERE}
        ${ORDER}
        ${LIMIT}`
    }

    public async getAllMediaIdByType(): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const medias: Media[] = await conn.query(`SELECT id, jellyfinId, title FROM Media WHERE mediaType = ?`, [this.currentMediaType]);
            return medias;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getMediaWithNullPoster(): Promise<{ movies: Node[], series: Node[] }> {
        const conn = await this.pool.getConnection();
        const nodeMovies: Node[] = [];
        const nodeSeries: Node[] = [];
        try {
            const query: string = `
                SELECT DISTINCT
                    m.id,
                    m.title,
                    m.mediaType
                FROM media m

                LEFT JOIN poster pl ON pl.id = m.srcLogo
                LEFT JOIN poster pb ON pb.id = m.srcBackground

                WHERE
                    m.srcLogo IS NULL
                    OR
                    m.srcBackground IS NULL
                    OR
                    NOT EXISTS (
                        SELECT 1
                        FROM media_poster mp
                        WHERE mp.mediaId = m.id
                        AND mp.type = 'HORIZONTAL'
                    )
                    OR
                    NOT EXISTS (
                        SELECT 1
                        FROM media_poster mp
                        WHERE mp.mediaId = m.id
                        AND mp.type IN ('NORMAL', 'SPECIAL', 'LICENSE')
                    );`
            const medias: Media[] = await conn.query(query);
            medias.forEach((media: Media) => {
                if (media.mediaType === MediaType.MOVIE) {
                    nodeMovies.push({
                        id: media.id,
                        name: media.title
                    });
                } else if (media.mediaType === MediaType.SERIES) {
                    nodeSeries.push({
                        id: media.id,
                        name: media.title
                    });
                }
            });
            return {
                movies: nodeMovies,
                series: nodeSeries
            }
        } catch (error) {
            return {
                movies: nodeMovies,
                series: nodeSeries
            }
        } finally {
            await conn.release();
        }
    }

    protected async insertManyMediaCategory(mediaId: number, categories: CategorySimple[], conn: mariadb.PoolConnection): Promise<string> {
        if (categories.length > 0) {
            try {
                const values: any[] = [];
                categories.forEach((item) => {
                    values.push(mediaId);
                    values.push(item.id);
                });
                const query = `
                    INSERT INTO Media_Category (mediaId, categoryId)
                    VALUES ${categories.map(() => ('(?, ?)')).join(', ')}`;
                const result: any = await conn.query(query, values);
                return `Les categories ont été ajoutés au média (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucune categorie n'est à ajouter";
        }
    }
    protected async deleteAndUpdateMediaCategory(mediaId: number, categories: CategorySimple[], conn: mariadb.PoolConnection): Promise<string> {
        try {
            await conn.query(`DELETE FROM Media_Category WHERE mediaId = ?`, [mediaId]);
            return await this.insertManyMediaCategory(mediaId, categories, conn);
        } catch (error) {
            throw error;
        }
    }

    protected async insertManyTranslationTitle(mediaId: number, translationTitles: TranslationTitle[], conn: mariadb.PoolConnection): Promise<string> {
        if (translationTitles.length > 0) {
            try {
                const values: any[] = [];
                translationTitles.forEach((title: TranslationTitle) => {
                    values.push(title.title);
                    values.push(title.iso_639_1);
                    values.push(mediaId);
                })
                const query: string = `
                    INSERT INTO Translation_Title (title, iso_639_1, mediaId)
                    VALUES ${translationTitles.map(() => '(?, ?, ?)').join(', ')}`;
                const result: any = await conn.query(query, values);
                return `Les traductions du titre ont été ajoutées (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucune traduction de titre n'est à ajouter";
        }
    }
    protected async deleteAndUpdateTranslationTitle(mediaId: number, translationTitles: TranslationTitle[], conn: mariadb.PoolConnection): Promise<string> {
        try {
            await conn.query(`DELETE FROM Translation_Title WHERE mediaId = ?`, [mediaId]);
            return await this.insertManyTranslationTitle(mediaId, translationTitles, conn);
        } catch (error) {
            throw error;
        }
    }

    protected async insertKeyword(mediaId: number, keywords: string[], conn: mariadb.PoolConnection): Promise<string> {
        if (keywords.length > 0) {
            try {
                const values: any[] = [];
                keywords.forEach((item) => {
                    values.push(item);
                    values.push(mediaId);
                });
                const query: string = `
                    INSERT INTO Keyword (name, mediaId)
                    VALUES ${keywords.map(() => '(?, ?)').join(', ')}`;
                const result: any = await conn.query(query, values);
                return `Les most clés ont été insérés (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucun mots clé n'est à ajouter";
        }
    }
    protected async deleteAndUpdateKeyword(mediaId: number, keywords: string[], conn: mariadb.PoolConnection): Promise<string> {
        try {
            await conn.query(`DELETE FROM Keyword WHERE mediaId = ?`, [mediaId]);
            return await this.insertKeyword(mediaId, keywords, conn);
        } catch (error) {
            throw error;
        }
    }

    protected async getIfMediaExistByTitleType(title: string, id: number, conn: mariadb.PoolConnection): Promise<boolean> {
        try {
            const formatedTitle: string = this.formatPathService.formatPath(title);
            const query = `SELECT title from Media WHERE id != ? AND mediaType = ?;`
            const result: any[] = await conn.query(query, [id, this.currentMediaType]);
            const medias: any[] = result.filter((item) => this.formatPathService.formatPath(item.title) === formatedTitle);
            if (medias.length > 0) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            throw error;
        }
    }

    protected async getMediaByResearch(keyWord: string, conn: mariadb.PoolConnection): Promise<number[]> {
        try {
            const query: string = `SELECT id, title FROM Media WHERE mediaType = ?`
            const result: SearchItem[] = await conn.query(query, [this.currentMediaType]);
            return this.searchService.getItemByResearch(keyWord, result);
        } catch (error) {
            return [];
        }
    }

    public async getMoviesAndSeriesByResearch(userId: number, keyWord: string): Promise<any[]> {
        const conn = await this.pool.getConnection();
        try {
            const querySelectAllMedias: string = `SELECT id, title FROM Media`;
            const resultSelectAllMedias: SearchItem[] = await conn.query(querySelectAllMedias);
            const mediaIds: number[] = this.searchService.getItemByResearch(keyWord, resultSelectAllMedias);
            const medias: Media[] = [];
            if (mediaIds.length > 0) {
                const JOIN: string = '';
                const WHERE: string = `WHERE m.id IN (${mediaIds.map(() => '?').join(', ')})`;
                const ORDER: string = `ORDER BY FIELD (m.id, ${mediaIds.map(() => '?').join(', ')})`;
                const LIMIT: string = `LIMIT 50`;
                const queryFiltered: string = this.getQuerySelectMedia(JOIN, WHERE, ORDER, LIMIT);
                const results: any[] = await conn.query(queryFiltered, [userId, userId, ...mediaIds, ...mediaIds]);
                return results;
            }
            return medias;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    protected async deleteMediasById(mediaId: number, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        try {
            const [title, mediaType, posterId] = await this.getAllPosterIdLinkedToMedia(mediaId, conn);
            const resulMediaStatUser = await conn.query(`DELETE su FROM Stat_User su WHERE su.movieId = ?
                                                        OR su.episodeId IN (
                                                            SELECT e.id
                                                            FROM Episode e
                                                            WHERE e.seriesId = ?
                                                        );`, [mediaId, mediaId]);

            const resultTranslationTitle = await conn.query(`DELETE FROM Translation_Title WHERE mediaId = ?`, [mediaId]);
            const resultMediaSatff = await conn.query(`DELETE FROM Media_Credit WHERE mediaId = ?`, [mediaId]);
            const resultMediaCategory = await conn.query(`DELETE FROM Media_Category WHERE mediaId = ?`, [mediaId]);
            const resultKeyword = await conn.query(`DELETE FROM Keyword WHERE mediaId = ?`, [mediaId]);

            const resultSimilarMedia = await conn.query(`DELETE FROM Similar_Title WHERE sourceId = ? OR targetId = ?`, [mediaId, mediaId]);

            const resultSelectionMedia = await conn.query(`DELETE FROM Selection_Media WHERE mediaId = ?`, [mediaId]);
            const resultLicenseMedia = await conn.query(`DELETE FROM License_Media WHERE mediaId = ?`, [mediaId]);
            const resultNews = await conn.query(`DELETE FROM News WHERE mediaId = ?`, [mediaId]);
            const resultNewsVideoRunning = await conn.query(`DELETE FROM News_Video_Running WHERE mediaId = ?`, [mediaId]);

            const resultEpisode = await conn.query(`DELETE FROM Episode WHERE seriesId = ?`, [mediaId]);
            const resultSeason = await conn.query(`DELETE FROM Season WHERE seriesId = ?`, [mediaId]);

            const resulMediaUserList = await conn.query(`DELETE FROM User_Media_List WHERE mediaId = ?`, [mediaId]);

            const resultPoster = await this.posterService.deteleAllPostersLinkedToMedia(mediaId, posterId, this.formatPathService.formatPath(title), mediaType, conn);
            await conn.query(`DELETE FROM Media WHERE id = ?`, [mediaId]);
            const message: string = `${this.currentMediaType} supprimé \n Traduction de titre (${resultTranslationTitle.affectedRows}) \n Acteurs/Réalisateur (${resultMediaSatff.affectedRows}) \n Categories (${resultMediaCategory.affectedRows}) \n Mots clés (${resultKeyword.affectedRows})
            \n Selection Media (${resultSelectionMedia.affectedRows}) \n License Media (${resultLicenseMedia.affectedRows}) \n News (${resultNews.affectedRows}) \n News Video Running (${resultNewsVideoRunning.affectedRows})
            \n Episode (${resultEpisode.affectedRows}) \n Saison (${resultSeason.affectedRows}) \n ${resultPoster} \n Titre Similaire (${resultSimilarMedia.affectedRows})
            \n MyList (${resulMediaUserList.affectedRows}) \n StatUser (${resulMediaStatUser.affectedRows})`;
            return {
                id: 0,
                state: true,
                message: message
            }
        } catch (error) {
            throw error;
        }
    }

    private async getAllPosterIdLinkedToMedia(mediaId: number, conn: mariadb.PoolConnection): Promise<[string, MediaType, number[]]> {
        try {
            const querySelectAllPosterId: string = `
                SELECT m.title, 
                    m.mediaType, 
                    m.srcLogo, 
                    m.srcBackground, 
                    GROUP_CONCAT(DISTINCT p.posterId SEPARATOR ';') AS poster, 
                    GROUP_CONCAT(DISTINCT s.srcPoster SEPARATOR ';') AS posterSeason, 
                    GROUP_CONCAT(DISTINCT e.srcPoster SEPARATOR ';') AS posterEpisode 
                    FROM media m 
                    LEFT JOIN media_poster p ON p.mediaId = m.id  
                    LEFT JOIN season s ON s.seriesId = m.id 
                    LEFT JOIN episode e ON e.seriesId = m.id 
                    WHERE m.id = ?`
            const resultSelectAllPosterId = await conn.query(querySelectAllPosterId, [mediaId]);
            const posterIds: number[] = [];
            const series: any = resultSelectAllPosterId[0];
            if (series.srcLogo) posterIds.push(Number(series.srcLogo));
            if (series.srcBackground) posterIds.push(Number(series.srcBackground));
            if (series.poster) posterIds.push(...series.poster.split(';').map((item) => Number(item)));
            if (series.posterSeason) posterIds.push(...series.posterSeason.split(';').map((item) => Number(item)));
            if (series.posterEpisode) posterIds.push(...series.posterEpisode.split(';').map((item) => Number(item)));
            return [series.title, series.mediaType, posterIds];
        } catch (error) {
            throw error;
        }
    }

    public async deleteAllMediaByType(): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const medias: Media[] = await this.getAllMediaIdByType();
            for (const media of medias) {
                await this.deleteMediasById(media.id, conn);
            }
            await conn.commit();
            return {
                id: 1,
                state: true,
                message: `Tous les médias ${this.currentMediaType} ont été supprimé`
            }
        } catch (error) {
            await conn.rollback();
            throw error;
        }
    }

    protected getStringFromDate(date: Date): string {
        try {
            date = new Date(date);
            const formatted = date.toISOString().split('T')[0];
            return formatted;
        } catch (error) {
            const formatted = new Date().toISOString().split('T')[0];
            return formatted;
        }
    }


    public async getMediaByCatalogFilters(
        userId: number,
        decadeFilter: number,
        categoryFilter: number,
        mediaTypeFilter: MediaType,
        sortFilter: SortCatalog,
        orderDirection: boolean,
        count: number,
        offset: number
    ): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const params: any[] = [userId, userId];
            const conditions: string[] = [];
            const JOIN: string = '';

            if (mediaTypeFilter != null) {
                conditions.push(`m.mediaType = ?`);
                params.push(mediaTypeFilter);
            }

            if (decadeFilter != null) {
                conditions.push(`YEAR(m.date) >= ? AND YEAR(m.date) < ?`);
                params.push(decadeFilter, decadeFilter + 10);
            }

            if (categoryFilter != null) {
                conditions.push(
                    `EXISTS (
                        SELECT 1 FROM media_category mc
                        WHERE mc.mediaId = m.id AND mc.categoryId = ?
                    )`,
                );
                params.push(categoryFilter);
            }

            const WHERE: string =
                conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const direction: string = orderDirection ? 'ASC' : 'DESC';
            const ORDER: string = `ORDER BY ${this.resolveSortColumn(sortFilter)} ${direction}`;

            const LIMIT: string = `LIMIT ? OFFSET ?`;
            params.push(count, offset);

            const query: string = this.getQuerySelectMedia(JOIN, WHERE, ORDER, LIMIT);

            const results: any[] = await conn.query(query, params);

            return results;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    private resolveSortColumn(sort: SortCatalog): string {
        switch (sort) {
            case SortCatalog.TITLE: return 'm.title';
            case SortCatalog.RELEASE_DATE: return 'm.date';
            case SortCatalog.ADDED_DATE: return 'm.createdAt';
            case SortCatalog.DURATION: return 'm.time';
            case SortCatalog.SHUFFLE: return 'RAND()';
            default: return 'RAND()';
        }
    }

    public async getMediaInfoById(mediaId: number): Promise<any> {
        const conn = await this.pool.getConnection();
        const query: string = `SELECT
                JSON_OBJECT(
                    'id', m.id,
                    
                    'casts', cast.casts,
                    'crews', crew.crews,
                    'categories', cat.categories,
                    'keyWords', kw.keywords

                ) AS media
                FROM media m

                LEFT JOIN (
                    SELECT mediaId, JSON_ARRAYAGG(name) AS keywords
                    FROM keyword
                    GROUP BY mediaId
                ) kw ON kw.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', c.id,
                                'name', c.name
                            )
                        ) AS categories
                    FROM media_category mc
                    JOIN category c ON c.id = mc.categoryId
                    GROUP BY mc.mediaId
                ) cat ON cat.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', cca.id,
                                'tmdbId', cca.tmdbId,
                                'fullName', cca.fullName,
                                'originalFullName', cca.originalFullName,
                                'character', mc.character,
                                'job', mc.job,
                                'srcPoster', p.name,
                                'order', mc.\`order\`
                            )
                            ORDER BY mc.\`order\` asc
                            LIMIT 12
                        ) AS casts
                    FROM media_credit mc
                    JOIN credit cca ON cca.id = mc.creditId
                    LEFT JOIN Poster p ON p.id = cca.srcPoster
                    WHERE mc.job IN ('${Job.ACTOR}')
                    GROUP BY mc.mediaId
                    ORDER BY mc.\`order\` asc
                ) cast ON cast.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', ccr.id,
                                'tmdbId', ccr.tmdbId,
                                'fullName', ccr.fullName,
                                'originalFullName', ccr.originalFullName,
                                'character', mc.character,
                                'job', mc.job,
                                'srcPoster', p.name,
                                'order', mc.\`order\`
                            )
                            ${this.creditService.getQueryOrderCredit('mc')}
                        ) AS crews
                    FROM media_credit mc
                    JOIN credit ccr ON ccr.id = mc.creditId
                    LEFT JOIN Poster p ON p.id = ccr.srcPoster
                    WHERE mc.job IN ('${Job.DIRECTOR}')
                    GROUP BY mc.mediaId
                    ORDER BY mc.\`order\` asc
                ) crew ON crew.mediaId = m.id
                
                WHERE m.id = ?`;

        try {
            const result: any[] = await conn.query(query, [mediaId]);
            return result[0].media;
        } catch (error) {
            console.log(error)
            return null;
        } finally {
            await conn.release();
        }
    }

}
