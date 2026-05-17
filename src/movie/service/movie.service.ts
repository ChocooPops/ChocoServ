import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Movie } from '../dto/movie.interface';
import { EditMovie } from '../dto/edit-movie.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { IntervalShowed } from 'src/media/dto/interval-showed.interface';
import { PosterService } from 'src/poster/service/poster.service';
import { FormatPathService } from 'src/common-service/format-path.service';
import { SimilarTitleService } from 'src/similar-title/service/similar-title.service';
import { Node } from 'src/common-interface/node.interface';
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { StatState } from 'src/stat-user/dto/stat-state.enum';
import { CreditService } from 'src/credit/service/credit.service';
import { MediaCredit } from 'src/credit/dto/media-credit.interface';
import { MediaService } from 'src/media/service/media/media.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class MovieService extends MediaService {

    protected override currentMediaType: MediaType = MediaType.MOVIE;

    constructor(@Inject(DATABASE_POOL) pool: mariadb.Pool,
        verifTimerShowService: VerifTimerShowService,
        formatPathService: FormatPathService,
        posterService: PosterService,
        i18nService: I18nService,
        @Inject(forwardRef(() => SimilarTitleService))
        private readonly similarTitleService: SimilarTitleService,
        private readonly statUserService: StatUserService,
        private readonly creditService: CreditService
    ) {
        super(pool, verifTimerShowService, formatPathService, posterService, i18nService);
    }

    public async getNodesMovie(): Promise<Node[]> {
        return await this.getNodesMediaByType();
    }

    private getQuerySelectMovies(otherInfos: boolean, WHERE: string, ORDER: string, LIMIT: string): string {
        let SELECT: string = '';
        let JOIN: string = '';
        if (otherInfos) {
            SELECT = `  'otherTitles', ot.otherTitles,
                        'categories', cat.categories,
                        'keyWords', kw.keywords,
                        'path', mlib.path,
                        'frames', mlib.frames,
                        'bytes', mlib.bytes,
                        'width', mlib.width,
                        'height', mlib.height,
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
                    'title', m.title,
                    'description', m.description,
                    'date', m.date,
                    'startShow', m.startShow,
                    'endShow', m.endShow,

                    ${SELECT}

                    'mediaLibraryId', mlib.id,
                    'duration', mlib.duration,
                    'resolution', mlib.resolution,

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
        movie.srcLogo = this.formatPathService.getOneFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcLogo);
        movie.srcBackgroundImage = this.formatPathService.getOneFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcBackgroundImage);
        movie.srcPoster.normal = this.formatPathService.getManyFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcPoster.normal);
        movie.srcPoster.special = this.formatPathService.getManyFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcPoster.special);
        movie.srcPoster.license = this.formatPathService.getManyFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcPoster.license);
        movie.srcPoster.horizontal = this.formatPathService.getManyFormatedPosterUrl(movie.id, this.currentMediaType, movie.srcPoster.horizontal);
        if (movie.credits) {
            movie.credits.forEach((credit: MediaCredit) => {
                credit.srcPoster = this.formatPathService.getOneFormatedPosterUrl(credit.id, MediaType.CREDIT, credit.srcPoster);
            });
        }
        delete (movie as any).seasons;
        return movie;
    }

    async getMovieByResearch(keyWord: string): Promise<Movie[]> {
        const medias: any[] = await this.getMediaByResearch(keyWord);
        const movies: Movie[] = [];
        medias.forEach((result: any) => {
            movies.push(this.getFormatedMovie(result));
        });
        return movies;
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
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                    
                const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(newMovie.startShow, newMovie.endShow);

                const query: string = `
                    INSERT INTO Media 
                    (title, mediaLibraryId, description, date, startShow, endShow, mediaType)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;

                const result: any = await conn.query(query,
                    [newMovie.title.trim(), newMovie.mediaLibraryId, newMovie.description, this.getStringFromDate(newMovie.date), interval.start, interval.end, this.currentMediaType]
                );
                const mediaId: number | null = result ? Number(result.insertId) || null : null;
                if (mediaId) {
                    let message: string = this.i18nService.t("common.MOVIE.MOVIE_REGISTERED", {
                        args: {
                            title: newMovie.title.trim()
                        }
                    }) + " \n ";
                    const formatedPath: string = mediaId.toString();
                    const messageCategory: string = await this.insertManyMediaCategory(mediaId, newMovie.categories, conn);
                    const messageTranslationTitle: string = await this.insertManyTranslationTitle(mediaId, newMovie.otherTitles, conn);
                    const messageCredit: string = await this.creditService.insertManyCredits(mediaId, newMovie.credits, conn);
                    const messageKeyWord: string = await this.insertKeyword(mediaId, newMovie.keyWords, conn);
                    const messagePoster: string = await this.posterService.insertManyPosterByMedia(newMovie, this.currentMediaType, formatedPath, mediaId, conn);

                    let messageSimilarTitle: string = `${this.i18nService.t("common.SIMILAR_TITLE.SIMILAR_TITLE_ADDED")} (0)`;
                    
                    if (insertSimilarTitle) {
                        messageSimilarTitle = await this.similarTitleService.saveSimilarTitlesForMediaById(mediaId, conn);
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
                        message: this.i18nService.t("common.MOVIE.FAILED")
                    }
                }
                    
            } catch (error: any) {
                await conn.rollback();
                messageReturned = {
                    id: -1,
                    state: false,
                    message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            messageReturned = {
                id: -1,
                state: false,
                message: this.i18nService.t("common.MOVIE.NOT_TITLE_BLANK")
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
                    const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(updateMovie.startShow, updateMovie.endShow);

                    const query: string = `
                        UPDATE Media
                        SET title = ?, mediaLibraryId = ?, description = ?, date = ?, startShow = ?, endShow = ?
                        WHERE id = ?`;
                    await conn.query(query,
                        [updateMovie.title.trim(), updateMovie.mediaLibraryId, updateMovie.description, this.getStringFromDate(updateMovie.date), interval.start, interval.end, updateMovie.id]
                    );
                    let message: string = this.i18nService.t("common.MOVIE.MOVIE_MODIFIED", {
                        args: {
                            title: updateMovie.title.trim()
                        }
                    }) + " \n ";
                    const formatedPath: string = oldMovie.id.toString();
                    const messageCategory: string = await this.deleteAndUpdateMediaCategory(updateMovie.id, updateMovie.categories, conn);
                    const messageTranslationTitle: string = await this.deleteAndUpdateTranslationTitle(updateMovie.id, updateMovie.otherTitles, conn);
                    const messageCredit: string = await this.creditService.deleteAndUpdateMediaCredit(updateMovie.id, updateMovie.credits, conn);
                    const messageKeyWord: string = await this.deleteAndUpdateKeyword(updateMovie.id, updateMovie.keyWords, conn);
                    const messagePoster: string = await this.posterService.deleteOrUpdatePosterByMedia(updateMovie, oldMovie, this.currentMediaType, formatedPath, conn);

                    const messageSimilarTitle: string = await this.similarTitleService.saveSimilarTitlesForMediaById(oldMovie.id, conn);

                    message += `${messageCategory} \n ${messageTranslationTitle} \n ${messageCredit} \n ${messageKeyWord} \n ${messagePoster} \n ${messageSimilarTitle}`;
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
                        message: this.i18nService.t("common.MOVIE.MOVIE_NOT_FOUND")
                    }
                }
            } catch (error: any) {
                await conn.rollback();
                messageReturned = {
                    id: -1,
                    state: false,
                    message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            messageReturned = {
                id: -1,
                state: false,
                message: this.i18nService.t("common.MOVIE.NOT_TITLE_BLANK")
            }
        }
        return messageReturned;
    }

    public async deleteMovieById(id: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const medias: Movie[] = await conn.query(`SELECT id, title FROM Media WHERE id = ? AND mediaType = ?`, [id, this.currentMediaType]);
            if (medias.length > 0) {
                await conn.beginTransaction();
                const message: ReturnMessage = await this.deleteMediasById(medias[0].id, medias[0].title, conn);
                await conn.commit();
                return message;
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.MOVIE.MOVIE_NOT_FOUND")
                }
            }
        } catch (error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
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
