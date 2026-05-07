import { Injectable, Inject } from '@nestjs/common';
import { News } from '../dto/news.interface';
import { EditNews } from '../dto/edit-news.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { DATABASE_POOL } from 'src/database/database.module';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import * as mariadb from 'mariadb';
import { MediaType } from 'src/media/dto/media-type.enum';
import { MediaService } from 'src/media/service/media/media.service';

@Injectable()
export class NewsService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService) { }

    private getQuerySelectNews(WHERE: string): string {
        return `
        SELECT 
            JSON_OBJECT(
                'id', n.id,
                'srcBackground', pnews.name,
                'orientation', n.orientation,
                'media', ${this.mediaService.getQuerySelectOneMedia()}
            ) AS news
        FROM news n
        LEFT JOIN media m ON m.id = n.mediaId
        LEFT JOIN poster pnews ON pnews.id = n.srcBackground	
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        ORDER BY n.orderIndex asc`;
    }

    private getFormatedNews(news: any): News {
        const formatedNews: News = news.news ? news.news : news;
        formatedNews.srcBackground = this.formatPathService.getOneFormatedPosterUrl(formatedNews.media.id, formatedNews.media.mediaType, formatedNews.srcBackground);
        if (formatedNews.media.mediaType === MediaType.MOVIE) {
            formatedNews.media = this.movieService.getFormatedMovie(formatedNews.media);
        } else if (formatedNews.media.mediaType === MediaType.SERIES) {
            formatedNews.media = this.seriesService.getFormatedSeries(formatedNews.media);
        }
        return formatedNews;
    }

    public async getAllNews(userId: number): Promise<News[]> {
        const conn = await this.pool.getConnection();
        try {
            const news: News[] = await conn.query(this.getQuerySelectNews(''), [userId, userId]);
            news.forEach((item: News, index) => {
                news[index] = this.getFormatedNews(item);
            });
            return news;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async updateNews(updatedNews: EditNews[]): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`DELETE FROM News`);
            const values: any[] = [];
            if (updatedNews.length > 0) {
                updatedNews.forEach((news: EditNews, index) => {
                    values.push(news.mediaId, this.formatPathService.getPotserIdByUrl(news.srcBackground), news.orientation, index);
                });
                const query = `INSERT INTO News (mediaId, srcBackground, orientation, orderIndex)
                VALUES ${updatedNews.map(() => '(?, ?, ?, ?)')}`
                const result = await conn.query(query, values);
                await conn.commit();
                return {
                    id: 0,
                    state: true,
                    message: `News insérées (${result.affectedRows})`
                }
            } else {
                await conn.commit();
                return {
                    id: 0,
                    state: true,
                    message: `Aucune News n'a été insérée`
                }
            }
        } catch (error: any) {
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
