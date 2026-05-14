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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { MediaService } from 'src/media/service/media/media.service';

const execAsync = promisify(exec);

@Injectable()
export class NewsVideoRunningService {
    private readonly newsPath: string = 'E:\\NEWS';

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly verifTimerShowService: VerifTimerShowService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService) { }


    public async getSimpleNewsRunningById(newsId: number): Promise<NewsVideoRunning | null> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT * FROM News_Video_Running WHERE id = ?`;
            const result: NewsVideoRunning[] = await conn.query(query, [newsId]);
            return result[0] ?? null;
        } catch (error) {
            throw error;
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectNewsVideoRunning(WHERE: string, isRandom: boolean, getPath: boolean): string {
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
                'mediaLibraryId', n.mediaLibraryId,
                ${getPath ? `'path', n.path,` : ''} 
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
        formatedNews.srcBackground = this.formatPathService.getOneFormatedPosterUrl(formatedNews.media.id, formatedNews.media.mediaType, formatedNews.srcBackground);
        if (formatedNews.media.mediaType === MediaType.MOVIE) {
            formatedNews.media = this.movieService.getFormatedMovie(formatedNews.media);
        } else if (formatedNews.media.mediaType === MediaType.SERIES) {
            formatedNews.media = this.seriesService.getFormatedSeries(formatedNews.media);
        }
        return formatedNews;
    }

    public async getRandomNewsMovieRunning(userId: number): Promise<NewsVideoRunning> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, true, false);
            const news: NewsVideoRunning[] = await conn.query(query, [userId, userId, MediaType.MOVIE]);
            news[0] = this.getFormatedNewsVideoRunning(news[0]);
            return news[0];
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getRandomSeriesRunning(userId: number): Promise<NewsVideoRunning> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, true, false);
            const news: NewsVideoRunning[] = await conn.query(query, [userId, userId, MediaType.SERIES]);
            news[0] = this.getFormatedNewsVideoRunning(news[0]);
            return news[0];
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getAllNewsMovieRunning(getPath: boolean = false): Promise<NewsVideoRunning[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, false, getPath);
            const news: NewsVideoRunning[] = await conn.query(query, [-1, -1, MediaType.MOVIE]);
            news.forEach((item: NewsVideoRunning, index) => {
                news[index] = this.getFormatedNewsVideoRunning(item);
            });
            return news ?? [];
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getAllNewsSeriesRunning(getPath: boolean = false): Promise<NewsVideoRunning[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectNewsVideoRunning(`WHERE m.mediaType = ?`, false, getPath);
            const news: NewsVideoRunning[] = await conn.query(query, [-1, -1, MediaType.SERIES]);
            news.forEach((item: NewsVideoRunning, index) => {
                news[index] = this.getFormatedNewsVideoRunning(item);
            });
            return news ?? [];
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    private async processVideoWithFFmpeg(
        inputPath: string,
        startShow: string,
        endShow: string,
        mediaLibraryId: string
    ): Promise<string> {
        await fs.mkdir(this.newsPath, { recursive: true });

        const outputFilename = `news_${mediaLibraryId}.mp4`;
        const outputPath = path.join(this.newsPath, outputFilename);

        const ffmpegCommand = [
            'ffmpeg',
            '-i', `"${inputPath}"`,
            '-ss', startShow,
            '-to', endShow,
            '-map 0:v:0',      // Premier stream vidéo
            '-map 0:a:0',      // Premier stream audio
            '-c:v copy',       // Copie vidéo (pas de ré-encodage)
            '-c:a aac',        // Convertit audio en AAC
            '-b:a 192k',       // Bitrate audio
            '-y',              // Écrase le fichier existant
            `"${outputPath}"`
        ].join(' ');

        try {
            const { stderr } = await execAsync(ffmpegCommand);

            if (stderr && stderr.includes('Error')) {
                throw new Error(stderr);
            }
            return outputPath;
        } catch (error) {
            throw error;
        }
    }

    private async deleteProcessedVideo(filePath: string): Promise<void> {
        try {
            if (filePath && filePath.startsWith(this.newsPath)) {
                await fs.unlink(filePath);
            }
        } catch (error) {
        }
    }

    private newsNeedsUpdate(
        existingNews: NewsVideoRunning | undefined,
        newMediaLibraryId: string,
        newStartShow: string,
        newEndShow: string
    ): boolean {
        if (!existingNews) {
            return true;
        }

        return existingNews.mediaLibraryId !== newMediaLibraryId ||
            existingNews.startShow !== newStartShow ||
            existingNews.endShow !== newEndShow;
    }

    public async updateNewsVideoRunning(newsUpdate: EditNewsVideoRunning[], mediaType: MediaType): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();

            const existingNews: NewsVideoRunning[] = mediaType === MediaType.MOVIE
                ? await this.getAllNewsMovieRunning(true)
                : mediaType === MediaType.SERIES
                    ? await this.getAllNewsSeriesRunning(true)
                    : [];

            const existingNewsMap = new Map(
                existingNews.map(news => [news.mediaLibraryId, news])
            );

            const newnewMediaLibraryIds = new Set(newsUpdate.map(n => n.mediaLibraryId));
            const newsToDelete = existingNews.filter(
                news => !newnewMediaLibraryIds.has(news.mediaLibraryId)
            );

            for (const news of newsToDelete) {
                if (news.path) {
                    await this.deleteProcessedVideo(news.path);
                }
                await conn.query(`DELETE FROM News_Video_Running WHERE mediaLibraryId = ?`, [news.mediaLibraryId]);
            }

            let processedCount = 0;
            let updatedCount = 0;
            let insertedCount = 0;
            let skippedCount = 0;

            for (const news of newsUpdate) {
                const interval: IntervalShowed = this.verifTimerShowService.getGoodIntervalWhenMovieShowed(
                    news.startShow,
                    news.endShow
                );

                const existingNewsItem = existingNewsMap.get(news.mediaLibraryId);
                let processedPath: string | null = null;

                if (this.newsNeedsUpdate(existingNewsItem, news.mediaLibraryId, interval.start, interval.end)) {
                    if (existingNewsItem?.path) {
                        await this.deleteProcessedVideo(existingNewsItem.path);
                    }

                    try {
                        const result = await conn.query(`SELECT path FROM Media_Library WHERE id = ?`, [news.mediaLibraryId]);
                        const mediaPath = result[0]?.path;

                        if (mediaPath) {
                            processedPath = await this.processVideoWithFFmpeg(
                                mediaPath,
                                interval.start,
                                interval.end,
                                news.mediaLibraryId
                            );
                            processedCount++;
                        }
                    } catch (error) {
                        throw error;
                    }
                } else {
                    processedPath = existingNewsItem.path;
                    skippedCount++;
                }

                if (existingNewsItem) {
                    await conn.query(`
                        UPDATE News_Video_Running 
                        SET mediaId = ?, 
                            srcBackground = ?, 
                            startShow = ?, 
                            endShow = ?, 
                            path = ?
                        WHERE mediaLibraryId = ?
                    `, [
                        news.mediaId,
                        this.formatPathService.getPotserIdByUrl(news.srcBackground),
                        interval.start,
                        interval.end,
                        processedPath,
                        news.mediaLibraryId
                    ]);
                    updatedCount++;
                } else {
                    await conn.query(`
                        INSERT INTO News_Video_Running 
                        (mediaId, srcBackground, mediaLibraryId, startShow, endShow, path)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        news.mediaId,
                        this.formatPathService.getPotserIdByUrl(news.srcBackground),
                        news.mediaLibraryId,
                        interval.start,
                        interval.end,
                        processedPath
                    ]);
                    insertedCount++;
                }
            }

            await conn.commit();

            return {
                id: 0,
                state: true,
                message: `News (${mediaType}) \n Insérées: ${insertedCount} \ Mises à jour: ${updatedCount} \ ` +
                    `\n Vidéos traitées: ${processedCount} \n Réutilisées: ${skippedCount} \ Supprimées: ${newsToDelete.length}`
            };

        } catch (error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur ${error.sqlMessage || error.message}`
            };
        } finally {
            await conn.release();
        }
    }
}