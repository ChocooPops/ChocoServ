import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { MediaService } from 'src/media/service/media.service';
import { Series } from '../dto/series.interface';
import { Episode } from '../dto/episode.interface';
import { EditSeries } from '../dto/edit-series.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { JellyfinService } from 'src/jellyfin/service/jellyfin.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { SearchService } from 'src/common-service/search.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { PosterService } from 'src/poster/service/poster.service';
import { EditSeason } from '../dto/edit-season.interface';
import { EditEpisode } from '../dto/edit-episode.interface';
import { IntervalShowed } from 'src/media/dto/interval-showed.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { Season } from '../dto/season.interface';
import { SimilarTitleService } from 'src/similar-title/service/similar-title.service';
import { Node } from 'src/common-interface/node.interface';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { promises as fs } from "fs";

@Injectable()
export class SeriesService extends MediaService {

    protected override currentMediaType: MediaType = MediaType.SERIES;

    constructor(@Inject(DATABASE_POOL) pool: mariadb.Pool,
        searchService: SearchService,
        verifTimerShowService: VerifTimerShowService,
        formatPathService: FormatPathService,
        posterService: PosterService,
        @Inject(forwardRef(() => JellyfinService))
        private readonly jellyfinService: JellyfinService,
        @Inject(forwardRef(() => SimilarTitleService))
        private readonly similarTitleService: SimilarTitleService,
        private readonly uploadImageService: UploadImageService
    ) {
        super(pool, searchService, verifTimerShowService, formatPathService, posterService);
    }

    public async getNodesSeries(): Promise<Node[]> {
        return await this.getNodesMediaByType();
    }

    public async getNodesEpisodePathDontExist(): Promise<Node[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT e.id, CONCAT(m.title, ' : ', e.name) AS name, e.path FROM episode e
                                    LEFT JOIN media m ON e.seriesId = m.id;`;
            const episodesWithoutPath: Node[] = [];
            const episodes: Episode[] = await conn.query(query);
            for (const episode of episodes) {
                try {
                    await fs.access(episode.path);
                } catch {
                    episodesWithoutPath.push({
                        id: episode.id,
                        name: episode.name
                    });
                }
            }
            return episodesWithoutPath;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectSeries(otherInfos: boolean, WHERE: string, ORDER: string, LIMIT: string): string {
        let SELECT: string = '';
        let JOIN: string = '';
        if (otherInfos) {
            SELECT = `'otherTitles', ot.otherTitles,`;
            JOIN = `LEFT JOIN (
                    SELECT mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'title', title,
                                'iso_639_1', iso_639_1
                            )
                        ) AS otherTitles
                    FROM translation_title
                    GROUP BY mediaId
                ) ot ON ot.mediaId = m.id`;
        }
        return `
            SELECT
                JSON_OBJECT(
                    'id', m.id,
                    'title', m.title,
                    'jellyfinId', m.jellyfinId,
                    'description', m.description,
                    'date', m.date,
                    'time', m.time,
                    'quality', m.quality,
                    'startShow', m.startShow,
                    'endShow', m.endShow,

                    ${SELECT}
                    'keyWord', kw.keywords,
                    'categories', cat.categories,
                    'actors', act.actors,
                    'directors', dir.directors,

                    'srcLogo', pl.name,
                    'srcBackgroundImage', pb.name,

                    'srcPoster', JSON_OBJECT(
                        'normal', posters.normal,
                        'special', posters.special,
                        'license', posters.license,
                        'horizontal', posters.horizontal
                    ),

                    'mediaType', m.mediaType,
                    'seasons', seas.seasons
                ) AS media
                FROM media m

                ${JOIN}

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
                    SELECT ms.mediaId,
                        JSON_ARRAYAGG(sa.fullName) AS actors
                    FROM media_staff ms
                    JOIN staff sa ON sa.id = ms.staffId AND sa.job = 'ACTOR'
                    GROUP BY ms.mediaId
                ) act ON act.mediaId = m.id

                LEFT JOIN (
                    SELECT ms.mediaId,
                        JSON_ARRAYAGG(sd.fullName) AS directors
                    FROM media_staff ms
                    JOIN staff sd ON sd.id = ms.staffId AND sd.job = 'DIRECTOR'
                    GROUP BY ms.mediaId
                ) dir ON dir.mediaId = m.id

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
            ${WHERE}
            ${ORDER}
            ${LIMIT}`
    }

    public getFormatedSeries(media: any): Series {
        const series: Series = media.media ? media.media : media;
        series.srcLogo = this.formatPathService.getOneFormatedPosterUrl(series.title, this.currentMediaType, series.srcLogo);
        series.srcBackgroundImage = this.formatPathService.getOneFormatedPosterUrl(series.title, this.currentMediaType, series.srcBackgroundImage);
        series.srcPoster.normal = this.formatPathService.getManyFormatedPosterUrl(series.title, this.currentMediaType, series.srcPoster.normal);
        series.srcPoster.special = this.formatPathService.getManyFormatedPosterUrl(series.title, this.currentMediaType, series.srcPoster.special);
        series.srcPoster.license = this.formatPathService.getManyFormatedPosterUrl(series.title, this.currentMediaType, series.srcPoster.license);
        series.srcPoster.horizontal = this.formatPathService.getManyFormatedPosterUrl(series.title, this.currentMediaType, series.srcPoster.horizontal);
        series.seasons = this.getFormatedSeasons(series.seasons, series.title);
        delete (series as any).time;
        delete (series as any).quality;
        delete (series as any).watchProgress;
        return series;
    }

    private getFormatedSeasons(seasons: Season[], title: string): Season[] {
        if (seasons) {
            seasons.forEach((season: Season, index) => {
                seasons[index].srcPoster = this.formatPathService.getOneFormatedPosterUrl(title, this.currentMediaType, season.srcPoster);
            })
            return seasons;
        } else {
            return [];
        }
    }

    public async getSimpleEpisodeById(episodeId: number): Promise<Episode | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT * FROM Episode WHERE id = ?`;
            const result: Episode[] = await conn.query(query, [episodeId]);
            return result[0] ?? null;
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async getFirstEpisodeBySeason(seriesId: number): Promise<Episode | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `
                SELECT 
                    e.*
                FROM Media m
                JOIN Season s 
                    ON s.seriesId = m.id
                JOIN Episode e 
                    ON e.seasonId = s.id
                WHERE m.id = ?
                AND s.seasonNumber = 1
                AND e.episodeNumber = 1
                AND m.mediaType = 'SERIES'
                LIMIT 1;`
            const result: Episode[] = await conn.query(query, [seriesId]);
            if (result.length > 0 && result[0]) {
                result[0].time = Number(result[0]);
            } else {
                return null;
            }
            return result[0] ?? null;
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async getLastWatchedEpisode(userId: number, seriesId: number): Promise<Episode | null> {
        const conn = await this.pool.getConnection();
        try {
            const result: any[] = await conn.query(
                `
                SELECT e.*, su.watchProgress
                FROM (
                    (
                        -- Cas 1: Retourner l'épisode IN_PROGRESS
                        SELECT su.episodeId, 1 as priority
                        FROM Stat_User su
                        INNER JOIN Episode e ON su.episodeId = e.id
                        WHERE su.userId = ? 
                        AND e.seriesId = ?
                        AND su.state = 'IN_PROGRESS'
                        ORDER BY su.updatedAt DESC
                        LIMIT 1
                    )
                    
                    UNION ALL
                    
                    (
                        -- Cas 2: Retourner l'épisode suivant dans la même saison si FINISHED
                        SELECT next_ep.id as episodeId, 2 as priority
                        FROM (
                            SELECT su.episodeId, e.seasonId, e.episodeNumber
                            FROM Stat_User su
                            INNER JOIN Episode e ON su.episodeId = e.id
                            WHERE su.userId = ?
                            AND e.seriesId = ?
                            AND su.state = 'FINISHED'
                            ORDER BY su.updatedAt DESC
                            LIMIT 1
                        ) last_stat
                        INNER JOIN Episode next_ep ON next_ep.seasonId = last_stat.seasonId 
                            AND next_ep.episodeNumber = last_stat.episodeNumber + 1
                    )
                    
                    UNION ALL
                    
                    (
                        -- Cas 3: Retourner le premier épisode de la saison suivante
                        SELECT first_ep.id as episodeId, 3 as priority
                        FROM (
                            SELECT e.seasonId, e.episodeNumber, s.seriesId, s.seasonNumber
                            FROM Stat_User su
                            INNER JOIN Episode e ON su.episodeId = e.id
                            INNER JOIN Season s ON e.seasonId = s.id
                            WHERE su.userId = ?
                            AND e.seriesId = ?
                            AND su.state = 'FINISHED'
                            ORDER BY su.updatedAt DESC
                            LIMIT 1
                        ) last_stat
                        INNER JOIN Season next_season ON next_season.seriesId = last_stat.seriesId 
                            AND next_season.seasonNumber = last_stat.seasonNumber + 1
                        INNER JOIN Episode first_ep ON first_ep.seasonId = next_season.id 
                            AND first_ep.episodeNumber = 1
                        WHERE NOT EXISTS (
                            SELECT 1 
                            FROM Episode check_ep 
                            WHERE check_ep.seasonId = last_stat.seasonId 
                            AND check_ep.episodeNumber = last_stat.episodeNumber + 1
                        )
                    )
                ) combined_results
                INNER JOIN Episode e ON e.id = combined_results.episodeId
                LEFT JOIN Stat_User su ON su.episodeId = combined_results.episodeId AND su.userId = ?
                ORDER BY combined_results.priority
                LIMIT 1
                `,
                [userId, seriesId, userId, seriesId, userId, seriesId, userId]
            );
            if (result.length > 0 && result[0]) {
                result[0].time = Number(result[0]);
                return result[0];
            } else {
                return await this.getFirstEpisodeBySeason(seriesId);
            }
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async getSeriesById(id: number): Promise<Series> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectSeries(true, `WHERE m.id = ?`, ``, ``);
            const result: any[] = await conn.query(query, id);
            const series: Series = this.getFormatedSeries(result[0]);
            for (const [index, season] of series.seasons.entries()) {
                const episodes: Episode[] = await this.getEpisodesBySeriesAndSeasonId(-1, series.id, season.id);
                series.seasons[index].episodes = episodes;
            }
            return series;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getSeriesByResearch(keyWord: string): Promise<Series[]> {
        const series: Series[] = [];
        const conn = await this.pool.getConnection();
        try {
            const mediaIds: number[] = await this.getMediaByResearch(keyWord, conn);
            if (mediaIds.length > 0) {
                const WHERE: string = `WHERE m.id IN (${mediaIds.map(() => '?').join(', ')})`;
                const ORDER: string = `ORDER BY FIELD (m.id, ${mediaIds.map(() => '?').join(', ')})`;
                const LIMIT: string = `LIMIT 50`;
                const query: string = this.getQuerySelectSeries(false, WHERE, ORDER, LIMIT);
                const results: any[] = await conn.query(query, [...mediaIds, ...mediaIds]);
                results.forEach((result) => {
                    series.push(this.getFormatedSeries(result));
                });
            }
            return series;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getEpisodesBySeriesAndSeasonId(userId: number, idSeries: number, idSeason: number): Promise<Episode[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `
                SELECT 
                    m.title,
                    e.id, 
                    e.seriesId,
                    e.seasonId,
                    e.jellyfinId, 
                    e.name, 
                    e.episodeNumber,
                    e.description,
                    e.date,
                    e.time,
                    e.quality,
                    p.name AS srcPoster,
                    su.watchProgress
                    FROM episode e
                    LEFT JOIN poster p ON p.id = e.srcPoster
                    LEFT JOIN media m ON m.id = e.seriesId
                    LEFT JOIN stat_user su ON su.userId = ? AND su.episodeId = e.id
                    WHERE e.seriesId = ? AND e.seasonId = ?
                    ORDER BY e.episodeNumber;`
            const results: any[] = await conn.query(query, [userId, idSeries, idSeason]);
            const episodes: Episode[] = [];
            results.forEach((result: any) => {
                episodes.push({
                    id: Number(result.id),
                    seasonId: Number(result.seasonId),
                    jellyfinId: result.jellyfinId,
                    name: result.name,
                    episodeNumber: Number(result.episodeNumber),
                    description: result.description,
                    date: result.date,
                    time: Number(result.time),
                    quality: result.quality,
                    srcPoster: this.formatPathService.getOneFormatedPosterUrl(result.title, MediaType.SERIES, result.srcPoster)
                });
            });
            return episodes;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getRandomSeries(): Promise<Series> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectSeries(false, 'WHERE m.mediaType = ?', 'ORDER BY RAND()', `LIMIT 1`);
            const series: Series = await conn.query(query, [this.currentMediaType]);
            return this.getFormatedSeries(series[0]);
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async insertNewSeries(newSeries: EditSeries, insertSimilarTitle: boolean): Promise<ReturnMessage> {
        let messageReturned !: ReturnMessage;
        if (newSeries.title && newSeries.title.trim() !== '') {
            const jellyfinItem: any = await this.jellyfinService.getItemJellyFinByIdForSeries(newSeries.jellyfinId);
            if (jellyfinItem) {
                const conn = await this.pool.getConnection();
                try {
                    await conn.beginTransaction();
                    if (!(await this.getIfMediaExistByTitleType(newSeries.title, -1, conn))) {
                        const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(newSeries.startShow, newSeries.endShow);
                        const query: string = `
                                    INSERT INTO Media 
                                    (title, jellyfinId, description, date, startShow, endShow, mediaType)
                                    VALUES (?, ?, ?, ?, ?, ?, ?);`;
                        const result: any = await conn.query(query,
                            [newSeries.title, newSeries.jellyfinId, newSeries.description, this.getStringFromDate(newSeries.date), interval.start, interval.end, this.currentMediaType]
                        );
                        const mediaId: number | null = result ? Number(result.insertId) || null : null;
                        if (mediaId) {
                            let message: string = 'La série a été enregistrée \n';
                            const formatedTitle: string = this.formatPathService.formatPath(newSeries.title);
                            const messageCategory: string = await this.insertManyMediaCategory(mediaId, newSeries.categories, conn);
                            const messageTranslationTitle: string = await this.insertManyTranslationTitle(mediaId, newSeries.otherTitles, conn);
                            const messageStaff: string = await this.insertManyStaff(mediaId, newSeries.actors, newSeries.directors, conn);
                            const messageKeyWord: string = await this.insertKeyword(mediaId, newSeries.keyWords, conn);
                            const messagePoster: string = await this.posterService.insertManyPosterByMedia(newSeries, this.currentMediaType, formatedTitle, mediaId, conn);
                            const messageSeason: string = await this.insertManySeasons(newSeries.seasons, mediaId, formatedTitle, newSeries.jellyfinId, conn);

                            let messageSimilarTitle: string = `Titre similaire ajouté (0)`;
                            if (insertSimilarTitle) {
                                messageSimilarTitle = await this.similarTitleService.saveSimilarTitlesForMediaByIdWithJellyfinDataBase(mediaId, conn);
                            }

                            message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageStaff} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSeason} \n ${messageSimilarTitle}`;
                            messageReturned = {
                                id: 0,
                                state: true,
                                message: message,
                                other: { id: mediaId }
                            }
                            await conn.commit();
                        } else {
                            messageReturned = {
                                id: -1,
                                state: false,
                                message: "Erreur : Echec de l'enregistrement de la série."
                            }
                        }
                    } else {
                        messageReturned = {
                            id: -1,
                            state: false,
                            message: 'Erreur : Une série possède déjà ce titre. Doublon impossible.'
                        }
                    }
                } catch (error) {
                    await conn.rollback();
                    return messageReturned = {
                        id: -1,
                        state: false,
                        message: error.sqlMessage
                    }
                } finally {
                    await conn.release();
                }
            } else {
                messageReturned = {
                    id: -1,
                    state: false,
                    message: 'Erreur : le fichier est introuvable'
                }
            }
        } else {
            messageReturned = {
                id: -1,
                state: false,
                message: 'Erreur : Le titre est vide'
            }
        }
        return messageReturned;
    }

    private async insertManySeasons(seasons: EditSeason[], seriesId: number, formatedTitle: string, jellyfinId: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (seasons.length > 0) {
                let message !: string;
                const values: any[] = [];
                seasons.forEach((season: EditSeason) => {
                    values.push(seriesId, season.name?.trim() ?? null, season.jellyfinId, season.seasonNumber);
                });
                const query = `INSERT INTO Season (seriesId, name, jellyfinId, seasonNumber)
                VALUES ${seasons.map(() => '(?, ?, ?, ?)').join(', ')}`;
                const result = await conn.query(query, values);
                const startIdNumber = Number(result.insertId);
                const count = Number(result.affectedRows);
                const insertedIds: number[] = Array.from({ length: count }, (_, i) => startIdNumber + i);
                message = await this.posterService.insertManySeasonPoster(insertedIds, seasons, formatedTitle, conn);
                for (const [index, id] of insertedIds.entries()) {
                    message += await this.insertManyEpisodes(seasons[index].episodes, seriesId, id, formatedTitle, jellyfinId, conn) + '\n ';
                }
                return message;
            } else {
                return `Aucune saison n'a été ajouté`
            }
        } catch (error) {
            throw error;
        }
    }

    private async insertManyEpisodes(episodes: EditEpisode[], seriesId: number, seasonId: number, formatedTitle: string, jellyfinId: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (episodes.length > 0) {
                const values: any[] = [];
                const episodesJellyfin: any[] = await this.jellyfinService.getAllEpisodesByJellyfinIdSeries(jellyfinId);
                for (const episode of episodes) {
                    const streamInfo = await this.jellyfinService.getStreamVideoByItemId(episode.jellyfinId);
                    let inputPath: string = streamInfo?.MediaSources[0]?.Path ?? null;
                    values.push(seriesId, seasonId, episode.jellyfinId, episode.name?.trim() ?? null, episode.episodeNumber, episode.description, this.getStringFromDate(episode.date));
                    const item: any = episodesJellyfin.find(item => item.Id === episode.jellyfinId);
                    values.push(item ? item.RunTimeTicks || 0 : 0);
                    values.push(item ? this.getQualityEpisode(item?.MediaStreams.find((item: any) => item.Type === "Video")?.Width) : 'any quality');
                    values.push(inputPath)
                }

                const query = `INSERT INTO Episode (seriesId, seasonId, jellyfinId, name, episodeNumber, description, date, time, quality, path)
                VALUES ${episodes.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`;
                const result = await conn.query(query, values);
                const startIdNumber = Number(result.insertId);
                const count = Number(result.affectedRows);
                const insertedIds: number[] = Array.from({ length: count }, (_, i) => startIdNumber + i);
                return await this.posterService.insertManyEpisodePoster(insertedIds, episodes, formatedTitle, conn);
            } else {
                return `Aucun épisode n'a été ajouté dans la saison ${seasonId}`;
            }
        } catch (error) {
            throw error;
        }
    }

    private getQualityEpisode(width: number | null): string {
        if (width) {
            let quality: string;
            if (width > 0) {
                if (width >= 3000) {
                    quality = '4K';
                } else if (width >= 2000) {
                    quality = '2K';
                } else if (width >= 1000) {
                    quality = '1080p';
                } else {
                    quality = '720p';
                }
            } else {
                quality = 'any quality';
            }
            return quality;
        } else {
            return 'any quality';
        }
    }

    public async updateSeries(updateSeries: EditSeries): Promise<ReturnMessage> {
        let messageReturned !: ReturnMessage;
        if (updateSeries.title && updateSeries.title.trim() !== '') {
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const oldSeries: Series = await this.getSeriesById(updateSeries.id);
                if (oldSeries && oldSeries.id) {
                    const jellyfinItem: any = await this.jellyfinService.getItemJellyFinByIdForSeries(updateSeries.jellyfinId);
                    if (jellyfinItem) {
                        if (!(await this.getIfMediaExistByTitleType(updateSeries.title, updateSeries.id, conn))) {
                            const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(updateSeries.startShow, updateSeries.endShow);
                            const query: string = `
                                        UPDATE Media
                                        SET title = ?, jellyfinId = ?, description = ?, date = ?, startShow = ?, endShow = ?
                                        WHERE id = ?`;
                            await conn.query(query,
                                [updateSeries.title.trim(), updateSeries.jellyfinId, updateSeries.description, this.getStringFromDate(updateSeries.date), interval.start, interval.end, updateSeries.id]
                            );
                            let message: string = 'La série a été modifié \n';
                            const oldFormatedTitle: string = this.formatPathService.formatPath(oldSeries.title);
                            const newFormatedTitle: string = this.formatPathService.formatPath(updateSeries.title);
                            const messageCategory: string = await this.deleteAndUpdateMediaCategory(updateSeries.id, updateSeries.categories, conn);
                            const messageTranslationTitle: string = await this.deleteAndUpdateTranslationTitle(updateSeries.id, updateSeries.otherTitles, conn);
                            const messageStaff: string = await this.deleteAndUpdateMediaStaff(updateSeries.id, updateSeries.actors, updateSeries.directors, conn);
                            const messageKeyWord: string = await this.deleteAndUpdateKeyword(updateSeries.id, updateSeries.keyWords, conn);
                            const messagePoster: string = await this.posterService.deleteOrUpdatePosterByMedia(updateSeries, oldSeries, this.currentMediaType, oldFormatedTitle, conn);
                            const messageSeasons: string = await this.insertUpdateOrDeleteSeasons(updateSeries.seasons, oldSeries.seasons, updateSeries.id, oldFormatedTitle, updateSeries.jellyfinId, conn);

                            if (oldFormatedTitle !== newFormatedTitle) {
                                await this.uploadImageService.renameFileOrdirectoryToMediaType(oldFormatedTitle, newFormatedTitle, this.currentMediaType);
                            }
                            message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageStaff} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSeasons}`;
                            messageReturned = {
                                id: 0,
                                state: true,
                                message: message,
                                other: { id: oldSeries.id }
                            }
                            await conn.commit();
                        } else {
                            messageReturned = {
                                id: -1,
                                state: false,
                                message: 'Erreur : Une série possède déjà ce titre. Doublon impossible.'
                            }
                        }
                    } else {
                        messageReturned = {
                            id: -1,
                            state: false,
                            message: 'Erreur : Le fichier est introuvable'
                        }
                    }
                } else {
                    messageReturned = {
                        id: -1,
                        state: false,
                        message: 'Erreur : id de la série introuvable.'
                    }
                }
            } catch (error) {
                await conn.rollback();
                messageReturned = {
                    id: -1,
                    state: false,
                    message: `Erreur : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            messageReturned = {
                id: -1,
                state: false,
                message: 'Erreur : Le titre est vide'
            }
        }
        return messageReturned;
    }

    private async insertUpdateOrDeleteSeasons(updateSeasons: EditSeason[], oldSeasons: Season[], seriesId: number, formatedTitle: string, jellyfinId: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const seasonToDelete: Season[] = oldSeasons.filter((oldSeason) => !updateSeasons.some((updatSeason) => updatSeason.id === oldSeason.id));
            const seasonToUpdate: EditSeason[] = updateSeasons.filter((updatSeason) => oldSeasons.some((oldSeason) => oldSeason.id === updatSeason.id));
            const seasonToInsert: EditSeason[] = updateSeasons.filter((updatSeason) => !oldSeasons.some((oldSeason) => oldSeason.id === updatSeason.id));

            const messageSeasonDelete: string = await this.deleteManySeasons(seasonToDelete, formatedTitle, conn);
            const messageSeasonToUpdate: string = await this.updateManySeasons(seasonToUpdate, oldSeasons, seriesId, formatedTitle, jellyfinId, conn);
            const messageSeasonInsert: string = await this.insertManySeasons(seasonToInsert, seriesId, formatedTitle, jellyfinId, conn);

            return `${messageSeasonDelete} \n ${messageSeasonToUpdate} \n ${messageSeasonInsert}`;
        } catch (error) {
            throw error;
        }
    }

    private async updateManySeasons(updateSeasons: EditSeason[], oldSeasons: Season[], seriesId: number, formatedTitle: string, jellyfinId: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (updateSeasons.length > 0) {
                for (const updateSeason of updateSeasons) {
                    const oldSeason: Season = oldSeasons.find((item) => item.id === updateSeason.id);
                    if (oldSeason) {
                        const querySeasonUpdate: string = `UPDATE Season
                            SET name = ?, jellyfinId = ?, seasonNumber = ?
                            WHERE id = ?`;
                        await conn.query(querySeasonUpdate, [updateSeason?.name.trim() ?? '', updateSeason.jellyfinId, updateSeason.seasonNumber, updateSeason.id]);
                        await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(updateSeason.id, updateSeason.srcPoster, oldSeason.srcPoster, formatedTitle, 'Season', conn);
                        const episodeToDelete: Episode[] = oldSeason.episodes.filter((oldEpisode) => !updateSeason.episodes.some((updateEpisode) => updateEpisode.id === oldEpisode.id));
                        const episodeToUpdate: EditEpisode[] = updateSeason.episodes.filter((updateEpisode) => oldSeason.episodes.some((oldEpisode) => updateEpisode.id === oldEpisode.id));
                        const episodeToInsert: EditEpisode[] = updateSeason.episodes.filter((updateEpisode) => !oldSeason.episodes.some((oldEpisode) => oldEpisode.id === updateEpisode.id));

                        const messageDeleteEpisodes: string = await this.deleteManyEpisodes(episodeToDelete, formatedTitle, conn);
                        const messageInsertEpisodes: string = await this.insertManyEpisodes(episodeToInsert, seriesId, updateSeason.id, formatedTitle, jellyfinId, conn);
                        const messageUpdateEpisodes: string = await this.updateManyEpisodes(episodeToUpdate, oldSeason.episodes, updateSeason.id, formatedTitle, jellyfinId, conn);
                        message += `Saison ${updateSeason.id} modifiée \n ${messageDeleteEpisodes} \n ${messageInsertEpisodes} \n ${messageUpdateEpisodes}`;
                    }
                }
            } else {
                message = `Aucune saison n'a été modifiée`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }
    private async updateManyEpisodes(updateEpisodes: EditEpisode[], oldEpisodes: Episode[], seasonId: number, formatedTitle: string, jellyfinId: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (updateEpisodes.length > 0) {
                const episodesJellyfin: any[] = await this.jellyfinService.getAllEpisodesByJellyfinIdSeries(jellyfinId);
                for (const episode of updateEpisodes) {
                    const oldEpisode: Episode = oldEpisodes.find((item) => item.id === episode.id);
                    await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(episode.id, episode.srcPoster, oldEpisode?.srcPoster, formatedTitle, 'Episode', conn);
                    const item: any = episodesJellyfin.find(item => item.Id === episode.jellyfinId);
                    const time: number = item ? item.RunTimeTicks || 0 : 0;
                    const quality: string = item ? this.getQualityEpisode(item?.MediaStreams.find((item: any) => item.Type === "Video")?.Width) : 'any quality';
                    const query: string = `UPDATE Episode
                        SET jellyfinId = ?, name = ?, episodeNumber = ?,
                        description = ?, date = ?, time = ?, quality = ?
                        WHERE id = ?;`;
                    await conn.query(query, [episode.jellyfinId, episode?.name.trim() ?? '', episode.episodeNumber, episode.description, this.getStringFromDate(episode.date), time, quality, episode.id]);

                    if (episode.jellyfinId !== oldEpisode.jellyfinId) {
                        const streamInfo = await this.jellyfinService.getStreamVideoByItemId(episode.jellyfinId);
                        let inputPath: string = streamInfo?.MediaSources[0]?.Path ?? null;
                        const queryPath: string = `UPDATE Episode SET path = ? WHERE id = ?;`;
                        await conn.query(queryPath, [inputPath, episode.id]);
                    }
                }
            } else {
                message = `Aucun episode n'a été modifié dans la saison ${seasonId}`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }

    private async deleteManySeasons(seasons: Season[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (seasons.length > 0) {
                for (const season of seasons) {
                    const episodes: Episode[] = await conn.query(`
                        SELECT e.id, p.name as srcPoster FROM Episode e
                        LEFT JOIN Poster p ON p.id = e.srcPoster
                        WHERE e.seasonId = ?`, [season.id]);
                    await this.deleteManyEpisodes(episodes, formatedTitle, conn);

                    await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(season.id, null, season.srcPoster, formatedTitle, 'Season', conn);
                    await conn.query(`DELETE FROM Season WHERE id = ?`, [season.id]);

                    message += `Saison ${season.id} supprimé`;
                }
            } else {
                return `Aucune saison n'a été supprimé`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }
    private async deleteManyEpisodes(episodes: Episode[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message = '';
            for (const episode of episodes) {
                const posterEpisode: string | null = episode.srcPoster ? episode.srcPoster.toString() : null;
                await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(episode.id, null, posterEpisode, formatedTitle, 'Episode', conn);
                await conn.query(`DELETE FROM Episode WHERE id = ?`, [episode.id]);
                message += `Episode ${episode.id} supprimé`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }

    public async deleteSeriesById(id: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const message: ReturnMessage = await this.deleteMediasById(id, conn);
            await conn.commit();
            return message;
        } catch (error) {
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

}
