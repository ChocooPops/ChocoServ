import { Injectable, Inject } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { CategorySimple } from 'src/category/dto/categorySimple.interface';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterService } from 'src/poster/service/poster.service';
import { Node } from 'src/common-interface/node.interface';
import { StatState } from 'src/stat-user/dto/stat-state.enum';
import { Media } from 'src/media/dto/media.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { TranslationTitle } from 'src/media/dto/translation-title.interface';
import { I18nService } from 'nestjs-i18n';
import { SearchService } from 'src/common-service/search.service';
import { SearchItem } from 'src/common-interface/search-item.interface';

@Injectable()
export class MediaService {

    protected currentMediaType !: MediaType;

    constructor(@Inject(DATABASE_POOL) protected readonly pool: mariadb.Pool,
        protected readonly verifTimerShowService: VerifTimerShowService,
        protected readonly formatPathService: FormatPathService,
        protected readonly posterService: PosterService,
        protected readonly i18nService: I18nService,
        protected readonly searchService: SearchService
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
            const query: string = `SELECT m.*, mlib.path as path 
                FROM Media m
                LEFT JOIN media_library mlib ON mlib.id = m.mediaLibraryId
                WHERE m.id = ?`;
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
                'startShow', m.startShow,
                'endShow', m.endShow,

                'keyWords', kw.keywords,

                'srcLogo', pl.name,
                'srcBackgroundImage', pb.name,

                'mediaLibraryId', mlib.id,
                'duration', mlib.duration,
                'resolution', mlib.resolution,

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

            LEFT JOIN Media_Library mlib ON m.mediaLibraryId = mlib.id
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
                            'mediaLibraryId', mlib.id,
                            'seriesId', s.seriesId,
                            'name', s.name,
                            'seasonNumber', s.seasonNumber,
                            'srcPoster', sp.name
                        )
                        ORDER BY s.seasonNumber
                    ) AS seasons
                FROM season s
                LEFT JOIN Media_Library mlib ON mlib.id = s.mediaLibraryId
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

    public getQuerySelectMedia(JOIN: string, WHERE: string, ORDER: string, LIMIT: string): string {
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

    public async getMediaByResearch(userId: number, keyWord: string, types: MediaType[]): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const normalizedKeyword = this.searchService.normalizedKeyword(keyWord);
            const keywords = normalizedKeyword.split(' ').filter(Boolean);

            const JOIN: string = `LEFT JOIN (
                SELECT mediaId, GROUP_CONCAT(title SEPARATOR '||') as translationTitles
                FROM Translation_Title
                WHERE iso_639_1 IN ('VO', 'US', 'FR')
                GROUP BY mediaId
            ) tt ON tt.mediaId = m.id`;
            const ORDER: string = `ORDER BY CHAR_LENGTH(m.title) ASC`;
            const LIMIT: string = `LIMIT 500`;

            const titleLikeConditions = keywords
                .map(() => `m.title LIKE ?`)
                .join(' AND ');

            const translationLikeConditions = keywords
                .map(() => `LOWER(tt.translationTitles) LIKE ?`)
                .join(' OR ');

            const WHERE_LIKE: string = `WHERE m.mediaType IN (?) AND (
                                            mlib.id = ?
                                            OR (${titleLikeConditions})
                                            OR (${translationLikeConditions})
                                        )
                                        GROUP BY m.id`;

            const titleLikeParams = keywords.map(k => `%${k}%`);
            const translationLikeParams = keywords.map(k => `%${k}%`);

            const likeResults: any[] = await conn.query(
                this.getQuerySelectMedia(JOIN, WHERE_LIKE, ORDER, LIMIT),
                [userId, userId, types, normalizedKeyword, ...titleLikeParams, ...translationLikeParams]
            );

            let fuzzyResults: any[] = [];
            if (likeResults.length < 50) {
                const keyLen = normalizedKeyword.length;
                const WHERE_FUZZY: string = `WHERE m.mediaType IN (?) AND
                                                ABS(CHAR_LENGTH(m.title) - ${keyLen}) <= ${keyLen}
                                            GROUP BY m.id`;

                const allCandidates: any[] = await conn.query(
                    this.getQuerySelectMedia(JOIN, WHERE_FUZZY, ORDER, LIMIT),
                    [userId, userId, types]
                );

                const likeIds = new Set(likeResults.map(r => r.media?.id));
                fuzzyResults = allCandidates.filter(r => {
                    if (!r.media?.title || likeIds.has(r.media.id)) return false;
                    const normalizedTitle = this.searchService.normalizedKeyword(r.media.title);
                    return normalizedTitle.split(' ').some(word =>
                        keywords.some(k => {
                            const distance = this.searchService.levenshteinDistance(word, k);
                            const maxDistance = this.searchService.getMaxDistance();
                            return distance <= maxDistance;
                        })
                    );
                });
            }

            const mainTitleResults = likeResults.filter(r => {
                const normalizedTitle = this.searchService.normalizedKeyword(r.media.title);
                return keywords.some(k => normalizedTitle.includes(k));
            });

            const translationOnlyResults = likeResults.filter(r => {
                const normalizedTitle = this.searchService.normalizedKeyword(r.media.title);
                return !keywords.some(k => normalizedTitle.includes(k));
            });

            const scoredResults = [...mainTitleResults, ...fuzzyResults];

            const searchItems: SearchItem[] = scoredResults
                .filter(r => r.media?.title != null)
                .map(r => ({
                    id: r.media.id,
                    title: r.media.title,
                }));

            const sortedIds: number[] = this.searchService.getItemByResearch(keyWord, searchItems);

            const sortedResults = sortedIds
                .map(id => scoredResults.find(r => r.media.id === id))
                .filter(Boolean);

            return [...sortedResults, ...translationOnlyResults].slice(0, 50);

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
                return `${this.i18nService.t("common.MEDIA.CATEGORY_ADDED_INTO_MOVIE")} (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return this.i18nService.t("common.MEDIA.NO_CATEGORY_ADDED_INTO_MOVIE");
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
                return `${this.i18nService.t("common.MEDIA.TRANSLATION_ADDED_INTO_MOVIE")} (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return this.i18nService.t("common.MEDIA.NO_TRANSLATION_ADDED_INTO_MOVIE");
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
                return `${this.i18nService.t("common.MEDIA.KEYWORD_ADDED_INTO_MOVIE")} (${result.affectedRows})`;
            } catch (error) {
                throw error;
            }
        } else {
            return this.i18nService.t("common.MEDIA.NO_KEYWORD_ADDED_INTO_MOVIE");
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

    protected async deleteMediasById(mediaId: number, title: string, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        try {
            const [mediaType, posterId] = await this.getAllPosterIdLinkedToMedia(mediaId, conn);
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

            const resultPoster = await this.posterService.deteleAllPostersLinkedToMedia(mediaId, posterId, mediaId.toString(), mediaType, conn);
            await conn.query(`DELETE FROM Media WHERE id = ?`, [mediaId]);
            
            const message: string = [
                this.i18nService.t('common.MEDIA.DELETED', { args: { mediaType: this.currentMediaType, title, mediaId } }),
                this.i18nService.t('common.MEDIA.TITLE_TRANSLATION', { args: { count: resultTranslationTitle.affectedRows } }),
                this.i18nService.t('common.MEDIA.ACTORS_DIRECTOR', { args: { count: resultMediaSatff.affectedRows } }),
                this.i18nService.t('common.MEDIA.CATEGORIES', { args: { count: resultMediaCategory.affectedRows } }),
                this.i18nService.t('common.MEDIA.KEYWORDS', { args: { count: resultKeyword.affectedRows } }),
                this.i18nService.t('common.MEDIA.SELECTION_MEDIA', { args: { count: resultSelectionMedia.affectedRows } }),
                this.i18nService.t('common.MEDIA.LICENSE_MEDIA', { args: { count: resultLicenseMedia.affectedRows } }),
                this.i18nService.t('common.MEDIA.NEWS', { args: { count: resultNews.affectedRows } }),
                this.i18nService.t('common.MEDIA.NEWS_VIDEO_RUNNING', { args: { count: resultNewsVideoRunning.affectedRows } }),
                this.i18nService.t('common.MEDIA.EPISODE', { args: { count: resultEpisode.affectedRows } }),
                this.i18nService.t('common.MEDIA.SEASON', { args: { count: resultSeason.affectedRows } }),
                resultPoster,
                this.i18nService.t('common.MEDIA.SIMILAR_TITLE', { args: { count: resultSimilarMedia.affectedRows } }),
                this.i18nService.t('common.MEDIA.MY_LIST', { args: { count: resulMediaUserList.affectedRows } }),
                this.i18nService.t('common.MEDIA.STAT_USER', { args: { count: resulMediaStatUser.affectedRows } }),
            ].join('\n');
            return {
                id: 0,
                state: true,
                message: message
            }
        } catch (error) {
            throw error;
        }
    }

    private async getAllPosterIdLinkedToMedia(mediaId: number, conn: mariadb.PoolConnection): Promise<[MediaType, number[]]> {
        try {
            const querySelectAllPosterId: string = `
                SELECT m.id,
                    m.title, 
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
            return [series.mediaType, posterIds];
        } catch (error) {
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

}
