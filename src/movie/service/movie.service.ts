import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { MediaService } from 'src/media/service/media.service';
import { Movie } from '../dto/movie.interface';
import { EditMovie } from '../dto/edit-movie.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { JellyfinService } from 'src/jellyfin/service/jellyfin.service';
import { MovieJellyfinInfo } from '../dto/jellyfin-info.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { SearchService } from 'src/common-service/search.service';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { IntervalShowed } from 'src/media/dto/interval-showed.interface';
import { PosterService } from 'src/poster/service/poster.service';
import { FormatPathService } from 'src/common-service/format-path.service';
import { SimilarTitleService } from 'src/similar-title/service/similar-title.service';
import { Node } from 'src/common-interface/node.interface';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { promises as fs } from "fs";
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { StatState } from 'src/stat-user/dto/stat-state.enum';
import { CreditService } from 'src/credit/service/credit.service';
import { MediaCredit } from 'src/credit/dto/media-credit.interface';

@Injectable()
export class MovieService extends MediaService {

    protected override currentMediaType: MediaType = MediaType.MOVIE;

    constructor(@Inject(DATABASE_POOL) pool: mariadb.Pool,
        searchService: SearchService,
        verifTimerShowService: VerifTimerShowService,
        formatPathService: FormatPathService,
        posterService: PosterService,
        @Inject(forwardRef(() => JellyfinService))
        private readonly jellyfinService: JellyfinService,
        @Inject(forwardRef(() => SimilarTitleService))
        private readonly similarTitleService: SimilarTitleService,
        private readonly statUserService: StatUserService,
        private readonly uploadImageService: UploadImageService,
        private readonly creditService: CreditService,
    ) {
        super(pool, searchService, verifTimerShowService, formatPathService, posterService);
    }

    public async getNodesMovie(): Promise<Node[]> {
        return await this.getNodesMediaByType();
    }

    public async getNodesMoviePathDontExist() : Promise<Node[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT id, title, path FROM MEDIA WHERE mediaType = ?`;
            const moviesWithoutPath: Node[] = [];
            const movies : Movie[] = await conn.query(query, [this.currentMediaType]);
            for (const movie of movies) {
                try {
                    await fs.access(movie.path);
                } catch {
                    moviesWithoutPath.push({
                        id : movie.id,
                        name : movie.title
                    });
                }
            }
            return moviesWithoutPath;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectMovies(otherInfos: boolean, WHERE: string, ORDER: string, LIMIT: string): string {
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
                                'name', c.name
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
                    'title', m.title,
                    'jellyfinId', m.jellyfinId,
                    'description', m.description,
                    'date', m.date,
                    'time', m.time,
                    'quality', m.quality,
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
                    'mediaType', m.mediaType
                ) AS media
                FROM media m

                ${JOIN}

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
            ${WHERE}
            ${ORDER}
            ${LIMIT}`
    }

    async getMovieById(id: number): Promise<Movie | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectMovies(true, `WHERE m.id = ?`, ``, ``);
            const result: any[] = await conn.query(query, [id]);
            return this.getFormatedMovie(result[0]);
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public getFormatedMovie(media: any): Movie {
        const movie: Movie = media.media ? media.media : media;
        movie.srcLogo = this.formatPathService.getOneFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcLogo);
        movie.srcBackgroundImage = this.formatPathService.getOneFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcBackgroundImage);
        movie.srcPoster.normal = this.formatPathService.getManyFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcPoster.normal);
        movie.srcPoster.special = this.formatPathService.getManyFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcPoster.special);
        movie.srcPoster.license = this.formatPathService.getManyFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcPoster.license);
        movie.srcPoster.horizontal = this.formatPathService.getManyFormatedPosterUrl(movie.title, this.currentMediaType, movie.srcPoster.horizontal);
        if (movie.credits) {
            movie.credits.forEach((credit: MediaCredit) => {
                credit.srcPoster = this.formatPathService.getOneFormatedPosterUrlFromCredit(credit.id, credit.fullName, credit.srcPoster);
            })
        }
        delete (movie as any).seasons;
        return movie;
    }

    async getMovieByResearch(keyWord: string): Promise<Movie[]> {
        const movies: Movie[] = [];
        const conn = await this.pool.getConnection();
        try {
            const mediaIds: number[] = await this.getMediaByResearch(keyWord, conn);
            if (mediaIds.length > 0) {
                const WHERE: string = `WHERE m.id IN (${mediaIds.map(() => '?').join(', ')})`;
                const ORDER: string = `ORDER BY FIELD (m.id, ${mediaIds.map(() => '?').join(', ')})`;
                const LIMIT: string = `LIMIT 50`;
                const query: string = this.getQuerySelectMovies(false, WHERE, ORDER, LIMIT);
                const results: any[] = await conn.query(query, [...mediaIds, ...mediaIds]);
                results.forEach((result) => {
                    movies.push(this.getFormatedMovie(result));
                });
            }
            return movies;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    async getRandomMovie(): Promise<Movie> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectMovies(false, 'WHERE m.mediaType = ?', 'ORDER BY RAND()', `LIMIT 1`);
            const movie: Movie = await conn.query(query, [this.currentMediaType]);
            return this.getFormatedMovie(movie[0]);
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    async insertNewMovie(newMovie: EditMovie, insertSimilarTitle: boolean): Promise<ReturnMessage> {
        let messageReturned !: ReturnMessage;
        if (newMovie.title && newMovie.title.trim() !== '') {
            const jellyfinInfo: MovieJellyfinInfo = await this.jellyfinService.getInfoJellyfin(newMovie.jellyfinId);
            if (jellyfinInfo.id) {
                const conn = await this.pool.getConnection();
                try {
                    await conn.beginTransaction();
                    if (!(await this.getIfMediaExistByTitleType(newMovie.title, -1, conn))) {
                        const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(newMovie.startShow, newMovie.endShow);
                        const streamInfo = await this.jellyfinService.getStreamVideoByItemId(newMovie.jellyfinId);
                        let inputPath: string = streamInfo?.MediaSources[0]?.Path ?? null;

                        const query: string = `
                            INSERT INTO Media 
                            (title, jellyfinId, description, date, time, quality, startShow, endShow, mediaType, path)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                        const result: any = await conn.query(query,
                            [newMovie.title.trim(), newMovie.jellyfinId, newMovie.description, this.getStringFromDate(newMovie.date), jellyfinInfo.runTimeTicks, jellyfinInfo.quality, interval.start, interval.end, this.currentMediaType, inputPath]
                        );
                        const mediaId: number | null = result ? Number(result.insertId) || null : null;
                        if (mediaId) {
                            let message: string = 'Le film a été enregistré \n';
                            const formatedTitle: string = this.formatPathService.formatPath(newMovie.title);
                            const messageCategory: string = await this.insertManyMediaCategory(mediaId, newMovie.categories, conn);
                            const messageTranslationTitle: string = await this.insertManyTranslationTitle(mediaId, newMovie.otherTitles, conn);
                            const messageCredit: string = await this.creditService.insertManyCredits(mediaId, newMovie.credits, conn);
                            const messageKeyWord: string = await this.insertKeyword(mediaId, newMovie.keyWords, conn);
                            const messagePoster: string = await this.posterService.insertManyPosterByMedia(newMovie, this.currentMediaType, formatedTitle, mediaId, conn);

                            let messageSimilarTitle: string = `Titre similaire ajouté (0)`;
                            if (insertSimilarTitle) {
                                messageSimilarTitle = await this.similarTitleService.saveSimilarTitlesForMediaByIdWithJellyfinDataBase(mediaId, conn);
                            }

                            message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageCredit} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSimilarTitle}`;
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
                                message: "Erreur : Echec de l'enregistrement du film."
                            }
                        }
                    } else {
                        messageReturned = {
                            id: -1,
                            state: false,
                            message: 'Erreur : Un film possède déjà ce titre. Doublon impossible.'
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

    public async updateMovie(updateMovie: EditMovie): Promise<ReturnMessage> {
        let messageReturned !: ReturnMessage;
        if (updateMovie.title && updateMovie.title.trim() !== '') {
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const oldMovie: Movie = await this.getMovieById(updateMovie.id);
                if (oldMovie && oldMovie.id) {
                    const jellyfinInfo: MovieJellyfinInfo = await this.jellyfinService.getInfoJellyfin(updateMovie.jellyfinId);
                    if (jellyfinInfo.id) {
                        if (!(await this.getIfMediaExistByTitleType(updateMovie.title, updateMovie.id, conn))) {
                            const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(updateMovie.startShow, updateMovie.endShow);
                            const streamInfo = await this.jellyfinService.getStreamVideoByItemId(updateMovie.jellyfinId);
                            let inputPath: string = streamInfo?.MediaSources[0]?.Path ?? null;

                            const query: string = `
                                UPDATE Media
                                SET title = ?, jellyfinId = ?, description = ?, date = ?, time = ?, quality = ?, startShow = ?, endShow = ?, path = ?
                                WHERE id = ?`;
                            await conn.query(query,
                                [updateMovie.title.trim(), updateMovie.jellyfinId, updateMovie.description, this.getStringFromDate(updateMovie.date), jellyfinInfo.runTimeTicks, jellyfinInfo.quality, interval.start, interval.end, inputPath, updateMovie.id]
                            );
                            let message: string = 'Le film a été modifié \n';
                            const oldFormatedTitle: string = this.formatPathService.formatPath(oldMovie.title);
                            const newFormatedTitle: string = this.formatPathService.formatPath(updateMovie.title);
                            const messageCategory: string = await this.deleteAndUpdateMediaCategory(updateMovie.id, updateMovie.categories, conn);
                            const messageTranslationTitle: string = await this.deleteAndUpdateTranslationTitle(updateMovie.id, updateMovie.otherTitles, conn);
                            const messageCredit: string = await this.creditService.deleteAndUpdateMediaCredit(updateMovie.id, updateMovie.credits, conn);
                            const messageKeyWord: string = await this.deleteAndUpdateKeyword(updateMovie.id, updateMovie.keyWords, conn);
                            const messagePoster: string = await this.posterService.deleteOrUpdatePosterByMedia(updateMovie, oldMovie, this.currentMediaType, oldFormatedTitle, conn);

                            if (oldFormatedTitle !== newFormatedTitle) {
                                await this.uploadImageService.renameFileOrdirectoryToMediaType(oldFormatedTitle, newFormatedTitle, this.currentMediaType);
                            }
                            message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageCredit} \n ${messageKeyWord} \n ${messagePoster}`;
                            messageReturned = {
                                id: 0,
                                state: true,
                                message: message,
                                other: { id: updateMovie.id }
                            }
                            await conn.commit();
                        } else {
                            messageReturned = {
                                id: -1,
                                state: false,
                                message: 'Erreur : Un film possède déjà ce titre. Doublon impossible.'
                            }
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
                        message: 'Erreur : id du film introuvable.'
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

    public async deleteMovieById(id: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const message: ReturnMessage = await this.deleteMediasById(id, conn);
            await conn.commit();
            return message;
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

    public async getWatchProgressByMovieId(userId: number, movieId: number): Promise<{ watchProgress: number, state: StatState}> {
        try {
            const query: string = `
                SELECT su2.watchProgress, su2.state FROM Media m
                ${this.statUserService.getQueryJoinStatUserForMedia()}
                WHERE m.id = ?
            `;
            const watchProgress: any = await this.pool.query(query, [userId, userId, movieId]);
            return watchProgress[0];
        } catch(error) {
            return { watchProgress: 0, state: StatState.NOT_WATCHED}
        }
    }

}
