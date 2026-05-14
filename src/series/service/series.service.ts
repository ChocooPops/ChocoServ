import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Series } from '../dto/series.interface';
import { Episode } from '../dto/episode.interface';
import { EditSeries } from '../dto/edit-series.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
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
import { promises as fs } from "fs";
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { StatState } from 'src/stat-user/dto/stat-state.enum';
import { CreditService } from 'src/credit/service/credit.service';
import { MediaCredit } from 'src/credit/dto/media-credit.interface';
import { MediaService } from 'src/media/service/media/media.service';

@Injectable()
export class SeriesService extends MediaService {

    protected override currentMediaType: MediaType = MediaType.SERIES;

    constructor(@Inject(DATABASE_POOL) pool: mariadb.Pool,
        verifTimerShowService: VerifTimerShowService,
        formatPathService: FormatPathService,
        posterService: PosterService,
        @Inject(forwardRef(() => SimilarTitleService))
        private readonly similarTitleService: SimilarTitleService,
        private readonly statUserService: StatUserService,        
        private readonly creditService: CreditService,
    ) {
        super(pool, verifTimerShowService, formatPathService, posterService);
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
            SELECT = `'otherTitles', ot.otherTitles,
                      'categories', cat.categories,
                      'keyWords', kw.keywords,
                      ${this.creditService.getQuerySelectCredits()}`;

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
                ) ot ON ot.mediaId = m.id
                 
                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', c.id,
                                'translationKey', c.translationKey
                            )
                        ) AS categories
                    FROM media_category mc
                    JOIN category c ON c.id = mc.categoryId
                    GROUP BY mc.mediaId
                ) cat ON cat.mediaId = m.id
                 
                LEFT JOIN (
                    SELECT mediaId, JSON_ARRAYAGG(name) AS keywords
                    FROM keyword
                    GROUP BY mediaId
                ) kw ON kw.mediaId = m.id
                 
                ${this.creditService.getQueryJoinCredits(this.currentMediaType)}`;
        }
        return `
            SELECT
                JSON_OBJECT(
                    'id', m.id,
                    'mediaLibraryId', mlib.id,
                    'title', m.title,
                    'description', m.description,
                    'date', m.date,
                    'startShow', m.startShow,
                    'endShow', m.endShow,

                    ${SELECT}

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

                LEFT JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
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
            ${WHERE}
            ${ORDER}
            ${LIMIT}`
    }

    public getFormatedSeries(media: any): Series {
        const series: Series = media.media ? media.media : media;
        series.srcLogo = this.formatPathService.getOneFormatedPosterUrl(series.id, this.currentMediaType, series.srcLogo);
        series.srcBackgroundImage = this.formatPathService.getOneFormatedPosterUrl(series.id, this.currentMediaType, series.srcBackgroundImage);
        series.srcPoster.normal = this.formatPathService.getManyFormatedPosterUrl(series.id, this.currentMediaType, series.srcPoster.normal);
        series.srcPoster.special = this.formatPathService.getManyFormatedPosterUrl(series.id, this.currentMediaType, series.srcPoster.special);
        series.srcPoster.license = this.formatPathService.getManyFormatedPosterUrl(series.id, this.currentMediaType, series.srcPoster.license);
        series.srcPoster.horizontal = this.formatPathService.getManyFormatedPosterUrl(series.id, this.currentMediaType, series.srcPoster.horizontal);
        if (series.credits) {
            series.credits.forEach((credit: MediaCredit) => {
                credit.srcPoster = this.formatPathService.getOneFormatedPosterUrl(credit.id, MediaType.CREDIT, credit.srcPoster);
            });
        }
        series.seasons = this.getFormatedSeasons(series.seasons, series.id);
        delete (series as any).time;
        delete (series as any).quality;
        delete (series as any).watchProgress;
        delete (series as any).stateProgress;
        return series;
    }

    private getFormatedSeasons(seasons: Season[], seriesId: number): Season[] {
        if (seasons) {
            seasons.forEach((season: Season, index) => {
                seasons[index].srcPoster = this.formatPathService.getOneFormatedPosterUrl(seriesId, this.currentMediaType, season.srcPoster);
            })
            return seasons;
        } else {
            return [];
        }
    }

    public async getSimpleEpisodeById(episodeId: number): Promise<Episode | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT e.*, mlib.path as path 
            FROM Episode e
            LEFT JOIN media_library mlib ON mlib.id = e.mediaLibraryId
            WHERE e.id = ?`;
            const result: Episode[] = await conn.query(query, [episodeId]);
            return result[0] ?? null;
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async getFirstEpisodeBySeason(seriesId: number): Promise<Episode | null> {
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
            const result: Episode[] = await this.pool.query(query, [seriesId]);
            if (result.length > 0 && result[0]) {
                result[0].duration = Number(result[0].duration);
            } else {
                return null;
            }
            return result[0] ?? null;
        } catch (error) {
            throw error;
        }
    }

    public async getLastWatchedEpisode(userId: number, seriesId: number): Promise<Episode | null> {
        const conn = await this.pool.getConnection();
        try {
            const lastWatched: any[] = await conn.query(
                `
                SELECT 
                    e.*,
                    su.watchProgress,
                    su.state,
                    s.seasonNumber
                FROM Stat_User su
                INNER JOIN Episode e ON su.episodeId = e.id
                INNER JOIN Season s ON e.seasonId = s.id
                WHERE su.userId = ?
                AND e.seriesId = ?
                AND su.episodeId IS NOT NULL
                ORDER BY su.updatedAt DESC
                LIMIT 1
                `,
                [userId, seriesId]
            );

            if (!lastWatched.length || !lastWatched[0]) {
                return await this.getFirstEpisodeBySeason(seriesId);
            }

            const last = lastWatched[0];
            last.time = Number(last.time);

            if (last.state === 'IN_PROGRESS') {
                return last;
            }

            const nextInSeason: any[] = await conn.query(
                `
                SELECT e.*, 0 as watchProgress
                FROM Episode e
                WHERE e.seasonId = ?
                AND e.episodeNumber = ?
                LIMIT 1
                `,
                [last.seasonId, last.episodeNumber + 1]
            );

            if (nextInSeason.length && nextInSeason[0]) {
                nextInSeason[0].time = Number(nextInSeason[0].time);
                return nextInSeason[0];
            }

            const nextSeasonFirstEp: any[] = await conn.query(
                `
                SELECT e.*, 0 as watchProgress
                FROM Season s
                INNER JOIN Episode e ON e.seasonId = s.id
                WHERE s.seriesId = ?
                AND s.seasonNumber = ?
                AND e.episodeNumber = 1
                LIMIT 1
                `,
                [seriesId, last.seasonNumber + 1]
            );

            if (nextSeasonFirstEp.length && nextSeasonFirstEp[0]) {
                nextSeasonFirstEp[0].time = Number(nextSeasonFirstEp[0].time);
                return nextSeasonFirstEp[0];
            }

            return last;

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
            await conn.release();
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
        const medias: any[] = await this.getMediaByResearch(keyWord);
        const series: Series[] = [];
        medias.forEach((result) => {
            series.push(this.getFormatedSeries(result));
        });
        return series;
    }

    public async getEpisodesBySeriesAndSeasonId(userId: number, idSeries: number, idSeason: number): Promise<Episode[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `
                SELECT 
                    m.id as mediaId,
                    e.id,
                    e.mediaLibraryId,
                    e.seriesId,
                    e.seasonId,
                    e.name, 
                    e.episodeNumber,
                    e.description,
                    mlib.duration,
                    mlib.resolution,
                    e.date,
                    p.name AS srcPoster,
                    su.watchProgress,
                    su.state as stateProgress
                    FROM episode e
                    LEFT JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
                    LEFT JOIN poster p ON p.id = e.srcPoster
                    LEFT JOIN media m ON m.id = e.seriesId
                    ${this.statUserService.getQueryJoinStatUserForEpisode()}
                    WHERE e.seriesId = ? AND e.seasonId = ?
                    ORDER BY e.episodeNumber;`
            const results: any[] = await conn.query(query, [userId, userId, userId, idSeries, idSeason]);
            const episodes: Episode[] = [];
            results.forEach((result: any) => {
                episodes.push({
                    id: Number(result.id),
                    seriesId: Number(result.seriesId),
                    seasonId: Number(result.seasonId),
                    mediaLibraryId: result.mediaLibraryId,
                    name: result.name,
                    episodeNumber: Number(result.episodeNumber),
                    description: result.description,
                    date: result.date,
                    duration: Number(result.duration),
                    resolution: result.resolution,
                    srcPoster: this.formatPathService.getOneFormatedPosterUrl(result.mediaId, MediaType.SERIES, result.srcPoster),
                    watchProgress : result.watchProgress ?? 0,
                    stateProgress: result.stateProgress ?? StatState.NOT_WATCHED
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
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(newSeries.startShow, newSeries.endShow);
                const query: string = `
                        INSERT INTO Media 
                        (title, mediaLibraryId, description, date, startShow, endShow, mediaType)
                        VALUES (?, ?, ?, ?, ?, ?, ?);`;
                const result: any = await conn.query(query,
                    [newSeries.title.trim(), newSeries.mediaLibraryId, newSeries?.description.trim() ?? '', this.getStringFromDate(newSeries.date), interval.start, interval.end, this.currentMediaType]
                );
                const mediaId: number | null = result ? Number(result.insertId) || null : null;
                if (mediaId) {
                    let message: string = `La série (${newSeries.title.trim()}) a été enregistrée \n `;
                    const formatedPath: string = mediaId.toString();
                    const messageCategory: string = await this.insertManyMediaCategory(mediaId, newSeries.categories, conn);
                    const messageTranslationTitle: string = await this.insertManyTranslationTitle(mediaId, newSeries.otherTitles, conn);
                    const messageCredit: string = await this.creditService.insertManyCredits(mediaId, newSeries.credits, conn);
                    const messageKeyWord: string = await this.insertKeyword(mediaId, newSeries.keyWords, conn);
                    const messagePoster: string = await this.posterService.insertManyPosterByMedia(newSeries, this.currentMediaType, formatedPath, mediaId, conn);
                    const messageSeason: string = await this.insertManySeasons(newSeries.seasons, mediaId, formatedPath, conn);

                    let messageSimilarTitle: string = `Titre similaire ajouté (0)`;
                    if (insertSimilarTitle) {
                        messageSimilarTitle = await this.similarTitleService.saveSimilarTitlesForMediaById(mediaId, conn);
                    }

                    message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageCredit} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSeason} \n ${messageSimilarTitle}`;
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
            } catch (error: any) {
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
                message: 'Erreur : Le titre est vide'
            }
        }
        return messageReturned;
    }

    public async insertManySeasons(seasons: EditSeason[], seriesId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (seasons.length > 0) {
                let message: string = "";
                const values: any[] = [];
                seasons.forEach((season: EditSeason) => {
                    values.push(seriesId, season.name?.trim() ?? null, season.mediaLibraryId, season.seasonNumber);
                });
                const query = `INSERT INTO Season (seriesId, name, mediaLibraryId, seasonNumber)
                VALUES ${seasons.map(() => '(?, ?, ?, ?)').join(', ')}`;
                const result = await conn.query(query, values);
                const startIdNumber = Number(result.insertId);
                const count = Number(result.affectedRows);
                const insertedIds: number[] = Array.from({ length: count }, (_, i) => startIdNumber + i);
                await this.posterService.insertManySeasonPoster(insertedIds, seasons, formatedTitle, conn);
                for (const [index, id] of insertedIds.entries()) {
                    message += `Saison ${seasons[index].seasonNumber} inséré (ID: ${id}) \n`;
                    message += await this.insertManyEpisodes(seasons[index].episodes, seriesId, id, formatedTitle, conn) + '\n ';
                }
                return message;
            } else {
                return `Aucune saison n'a été ajouté`
            }
        } catch (error) {
            throw error;
        }
    }

    public async insertManyEpisodes(episodes: EditEpisode[], seriesId: number, seasonId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (episodes.length > 0) {
                let message: string = '';
                const values: any[] = [];
                for (const episode of episodes) {
                    values.push(seriesId, seasonId, episode.mediaLibraryId, episode.name?.trim() ?? null, episode.episodeNumber, episode.description, this.getStringFromDate(episode.date));
                }

                const query = `INSERT INTO Episode (seriesId, seasonId, mediaLibraryId, name, episodeNumber, description, date)
                VALUES ${episodes.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`;
                const result = await conn.query(query, values);
                const startIdNumber = Number(result.insertId);
                const count = Number(result.affectedRows);
                const insertedIds: number[] = Array.from({ length: count }, (_, i) => startIdNumber + i);
                await this.posterService.insertManyEpisodePoster(insertedIds, episodes, formatedTitle, conn);
                for (const [index, id] of insertedIds.entries()) {
                    message += `Episode ${episodes[index].episodeNumber} inséré (ID : ${id}) \n`;
                }
                return message;
            } else {
                return `Aucun épisode n'a été ajouté dans la saison ${seasonId}`;
            }
        } catch (error) {
            throw error;
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
                    const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(updateSeries.startShow, updateSeries.endShow);
                    const query: string = `
                            UPDATE Media
                            SET title = ?, mediaLibraryId = ?, description = ?, date = ?, startShow = ?, endShow = ?
                            WHERE id = ?`;
                    await conn.query(query,
                        [updateSeries.title.trim(), updateSeries.mediaLibraryId, updateSeries.description, this.getStringFromDate(updateSeries.date), interval.start, interval.end, updateSeries.id]
                    );
                    let message: string = `La série (${updateSeries.title.trim()}) a été modifié \n `;
                    const formatedPath: string = oldSeries.id.toString();
                    const messageCategory: string = await this.deleteAndUpdateMediaCategory(updateSeries.id, updateSeries.categories, conn);
                    const messageTranslationTitle: string = await this.deleteAndUpdateTranslationTitle(updateSeries.id, updateSeries.otherTitles, conn);
                    const messageCredit: string = await this.creditService.deleteAndUpdateMediaCredit(updateSeries.id, updateSeries.credits, conn);
                    const messageKeyWord: string = await this.deleteAndUpdateKeyword(updateSeries.id, updateSeries.keyWords, conn);
                    const messagePoster: string = await this.posterService.deleteOrUpdatePosterByMedia(updateSeries, oldSeries, this.currentMediaType, formatedPath, conn);
                    const messageSeasons: string = await this.insertUpdateOrDeleteSeasons(updateSeries.seasons, oldSeries.seasons, updateSeries.id, formatedPath, conn);

                    message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageCredit} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSeasons}`;
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
                        message: 'Erreur : id de la série introuvable.'
                    }
                }
            } catch (error: any) {
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

    private async insertUpdateOrDeleteSeasons(updateSeasons: EditSeason[], oldSeasons: Season[], seriesId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const seasonToDelete: Season[] = oldSeasons.filter((oldSeason) => !updateSeasons.some((updatSeason) => updatSeason.mediaLibraryId === oldSeason.mediaLibraryId));
            const seasonToUpdate: EditSeason[] = updateSeasons.filter((updatSeason) => oldSeasons.some((oldSeason) => oldSeason.mediaLibraryId === updatSeason.mediaLibraryId));
            const seasonToInsert: EditSeason[] = updateSeasons.filter((updatSeason) => !oldSeasons.some((oldSeason) => oldSeason.mediaLibraryId === updatSeason.mediaLibraryId));

            const messageSeasonDelete: string = await this.deleteManySeasons(seasonToDelete, formatedTitle, conn);
            const messageSeasonToUpdate: string = await this.updateManySeasons(seasonToUpdate, oldSeasons, seriesId, formatedTitle, conn);
            const messageSeasonInsert: string = await this.insertManySeasons(seasonToInsert, seriesId, formatedTitle, conn);

            return `${messageSeasonDelete} \n ${messageSeasonToUpdate} \n ${messageSeasonInsert}`;
        } catch (error) {
            throw error;
        }
    }

    private async updateManySeasons(updateSeasons: EditSeason[], oldSeasons: Season[], seriesId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (updateSeasons.length > 0) {
                for (const updateSeason of updateSeasons) {
                    const oldSeason: Season = oldSeasons.find((item) => item.mediaLibraryId === updateSeason.mediaLibraryId);
                    if (oldSeason) {
                        const querySeasonUpdate: string = `UPDATE Season
                            SET name = ?, mediaLibraryId = ?, seasonNumber = ?
                            WHERE mediaLibraryId = ?`;
                        await conn.query(querySeasonUpdate, [updateSeason?.name.trim() ?? '', updateSeason.mediaLibraryId, updateSeason.seasonNumber, updateSeason.mediaLibraryId]);
                        await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(oldSeason.id, updateSeason.srcPoster, oldSeason.srcPoster, formatedTitle, 'Season', conn);
                        const episodeToDelete: Episode[] = oldSeason.episodes.filter((oldEpisode) => !updateSeason.episodes.some((updateEpisode) => updateEpisode.mediaLibraryId === oldEpisode.mediaLibraryId));
                        const episodeToUpdate: EditEpisode[] = updateSeason.episodes.filter((updateEpisode) => oldSeason.episodes.some((oldEpisode) => updateEpisode.mediaLibraryId === oldEpisode.mediaLibraryId));
                        const episodeToInsert: EditEpisode[] = updateSeason.episodes.filter((updateEpisode) => !oldSeason.episodes.some((oldEpisode) => oldEpisode.mediaLibraryId === updateEpisode.mediaLibraryId));

                        const messageDeleteEpisodes: string = await this.deleteManyEpisodes(episodeToDelete, formatedTitle, conn);
                        const messageInsertEpisodes: string = await this.insertManyEpisodes(episodeToInsert, seriesId, oldSeason.id, formatedTitle, conn);
                        const messageUpdateEpisodes: string = await this.updateManyEpisodes(episodeToUpdate, oldSeason.episodes, oldSeason.id, formatedTitle, conn);
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
    private async updateManyEpisodes(updateEpisodes: EditEpisode[], oldEpisodes: Episode[], seasonId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (updateEpisodes.length > 0) {
                for (const episode of updateEpisodes) {
                    const oldEpisode: Episode = oldEpisodes.find((item) => item.mediaLibraryId === episode.mediaLibraryId);
                    await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(oldEpisode.id, episode.srcPoster, oldEpisode?.srcPoster, formatedTitle, 'Episode', conn);
                    const query: string = `UPDATE Episode
                        SET mediaLibraryId = ?, name = ?, episodeNumber = ?,
                        description = ?, date = ?
                        WHERE mediaLibraryId = ?;`;
                    await conn.query(query, [episode.mediaLibraryId, episode?.name.trim() ?? '', episode.episodeNumber, episode.description, this.getStringFromDate(episode.date), episode.mediaLibraryId]);
                }
            } else {
                message = `Aucun episode n'a été modifié dans la saison (ID : ${seasonId})`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }

    public async deleteManySeasons(seasons: Season[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message: string = '';
            if (seasons.length > 0) {
                for (const season of seasons) {
                    const episodes: Episode[] = await conn.query(`
                        SELECT e.id, e.episodeNumber, p.name as srcPoster FROM Episode e
                        LEFT JOIN Poster p ON p.id = e.srcPoster
                        WHERE e.seasonId = ?`, [season.id]);
                    message += await this.deleteManyEpisodes(episodes, formatedTitle, conn);

                    await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(season.id, null, season.srcPoster, formatedTitle, 'Season', conn);
                    await conn.query(`DELETE FROM Season WHERE id = ?`, [season.id]);

                    message += `Saison ${season.seasonNumber} (ID : ${season.id}) supprimé \n`;
                }
            } else {
                return `Aucune saison n'a été supprimé`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }
    public async deleteManyEpisodes(episodes: Episode[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            let message = '';
            for (const episode of episodes) {
                const posterEpisode: string | null = episode.srcPoster ? episode.srcPoster.toString() : null;
                await this.posterService.deleteOrUpdatePosterFromOneEpisodeOrSeason(episode.id, null, posterEpisode, formatedTitle, 'Episode', conn);
                await conn.query(`DELETE FROM Stat_User WHERE episodeId = ?`, [episode.id]);
                await conn.query(`DELETE FROM Episode WHERE id = ?`, [episode.id]);
                message += `Episode ${episode.episodeNumber}  (ID : ${episode.id}) supprimé \n`;
            }
            return message;
        } catch (error) {
            throw error;
        }
    }

    public async deleteSeriesById(id: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const medias: Series[] = await conn.query(`SELECT id, title FROM Media WHERE id = ? AND mediaType = ?`, [id, this.currentMediaType]);
            if (medias.length > 0) {
                await conn.beginTransaction();
                const message: ReturnMessage = await this.deleteMediasById(medias[0].id, medias[0].title, conn);
                await conn.commit();
                return message;
            } else {
                return {
                    id: -1,
                    state: false,
                    message: `Film introuvable => id incorrect`
                }
            }
        } catch (error: any) {
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

    public async getWatchProgressByEpisodeId(userId: number, episodeId: number): Promise<{ watchProgress: number, state: StatState}> {
        try {
            const query: string = `
                SELECT su.watchProgress, su.state FROM Episode e
                ${this.statUserService.getQueryJoinStatUserForEpisode()}
                WHERE e.id = ?
            `;
            const watchProgress: any = await this.pool.query(query, [userId, userId, userId, episodeId]);
            return watchProgress[0];
        } catch(error) {
            return { watchProgress: 0, state: StatState.NOT_WATCHED}
        }
    }

}
