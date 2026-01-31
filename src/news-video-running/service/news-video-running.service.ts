import { Injectable, Inject } from '@nestjs/common';
import { NewsVideoRunning } from '../dto/news-video-running.interface';
import { EditNewsVideoRunning } from '../dto/edit-news-video-running.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { FormatPathService } from 'src/common-service/format-path.service';
import { IntervalShowed } from 'src/media/dto/interval-showed.interface';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaService } from 'src/media/service/media.service';

@Injectable()
export class NewsVideoRunningService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly verifTimerShowService: VerifTimerShowService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService) { }

    private getQuerySelectNewsVideoRunning(WHERE: string, isRandom: boolean): string {
        const RANDOM: string = isRandom ? `
            ORDER BY RAND()
            LIMIT 1;
        ` : '';
        return `
        SELECT 
            JSON_OBJECT(
                'id', n.id,
                'srcBackground', pnews.name,
                'startShow', n.startShow,
                'endShow', n.endShow,
                'jellyfinId', n.jellyfinId,
                'media', ${this.mediaService.getQuerySelectOneMedia()}
            ) AS news
            
        FROM News_Video_Running n
        LEFT JOIN media m ON m.id = n.mediaId
        LEFT JOIN poster pnews ON pnews.id = n.srcBackground	
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        ${RANDOM};`
    }

    private getFormatedNewsVideoRunning(news: any): NewsVideoRunning {
        const formatedNews: NewsVideoRunning = news.news ? news.news : news;
        formatedNews.srcBackground = this.formatPathService.getOneFormatedPosterUrl(formatedNews.media.title, formatedNews.media.mediaType, formatedNews.srcBackground);
        if (formatedNews.media.mediaType === MediaType.MOVIE) {
            formatedNews.media = this.movieService.getFormatedMovie(formatedNews.media);
        } else if (formatedNews.media.mediaType === MediaType.SERIES) {
            formatedNews.media = this.seriesService.getFormatedSeries(formatedNews.media);
        }
        return formatedNews;
    }

    public async getRandomNewsMovieRunning(): Promise<NewsVideoRunning> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, true);
            const news: NewsVideoRunning[] = await conn.query(query, [MediaType.MOVIE]);
            news[0] = this.getFormatedNewsVideoRunning(news[0]);
            return news[0];
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getRandomSeriesRunning(): Promise<NewsVideoRunning> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, true);
            const news: NewsVideoRunning[] = await conn.query(query, [MediaType.SERIES]);
            news[0] = this.getFormatedNewsVideoRunning(news[0]);
            return news[0];
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getAllNewsMovieRunning(): Promise<NewsVideoRunning[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, false);
            const news: NewsVideoRunning[] = await conn.query(query, [MediaType.MOVIE]);
            news.forEach((item: NewsVideoRunning, index) => {
                news[index] = this.getFormatedNewsVideoRunning(item);
            });
            return news;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getAllNewsSeriesRunning(): Promise<NewsVideoRunning[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, false);
            const news: NewsVideoRunning[] = await conn.query(query, [MediaType.SERIES]);
            news.forEach((item: NewsVideoRunning, index) => {
                news[index] = this.getFormatedNewsVideoRunning(item);
            });
            return news;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async updateNewsVideoRunning(newsUpdate: EditNewsVideoRunning[], mediaType: MediaType): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`DELETE n
                FROM News_Video_Running n
                INNER JOIN media m ON m.id = n.mediaId
                WHERE m.mediaType = ?`, [mediaType]);
            if (newsUpdate.length > 0) {
                const values: any[] = [];
                newsUpdate.forEach((news: EditNewsVideoRunning) => {
                    const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(news.startShow, news.endShow);
                    values.push(news.mediaId, this.formatPathService.getPotserIdByUrl(news.srcBackground));
                    values.push(news.jellyfinId, interval.start, interval.end);
                });
                const query = `INSERT INTO News_Video_Running (mediaId, srcBackground, jellyfinId, startShow, endShow)
                        VALUES ${newsUpdate.map(() => '(?, ?, ?, ?, ?)')}`
                const result = await conn.query(query, values);
                await conn.commit();
                return {
                    id: 0,
                    state: true,
                    message: `News (${mediaType}) insérées (${result.affectedRows})`
                }
            } else {
                await conn.commit();
                return {
                    id: 0,
                    state: true,
                    message: `Aucune news ${mediaType} n'a été insérée`
                }
            }
        } catch (error) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }
}
