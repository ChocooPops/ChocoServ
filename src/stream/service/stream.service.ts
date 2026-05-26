import { Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { Response, Request } from 'express';
import { Episode } from 'src/series/dto/episode.interface';
import { NewsVideoRunning } from 'src/news-video-running/dto/news-video-running.interface';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { NewsVideoRunningService } from 'src/news-video-running/service/news-video-running.service';
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Movie } from 'src/movie/dto/movie.interface';

@Injectable()
export class StreamService {

    private readonly MAX_CHUNK_SIZE = 10 * 1024 * 1024;

    constructor(private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly newsVideoRunningService: NewsVideoRunningService,
        private readonly statUserService: StatUserService) { }

    private getFilePath(filename: string): string {
        return path.join(filename);
    }
    private fileExists(filename: string): boolean {
        return fs.existsSync(this.getFilePath(filename));
    }

    public async streamMovie(userId: number, movieId: number, req: Request, res: Response): Promise<any> {
        const movie: Movie = await this.movieService.getSimpleMediaById(movieId) as Movie;
        if (movie) {
            this.streamVideo(userId, movie.id, movie.path, Number(movie.duration), req, res, MediaType.MOVIE);
        } else {
            throw new NotFoundException();
        }
    }

    public async streamEpisode(userId: number, seasonId: number, episodeId: number, req: Request, res: Response): Promise<any> {
        const episode: Episode = await this.seriesService.getSimpleEpisodeById(episodeId);
        if (episode) {
            this.streamVideo(userId, episode.id, episode.path, Number(episode.duration), req, res, MediaType.EPISODE);
        } else {
            throw new NotFoundException();
        }        
    }

    public async streamNewVideoRunning(newsId: number, req: Request, res: Response): Promise<any> {
        const news: NewsVideoRunning = await this.newsVideoRunningService.getSimpleNewsRunningById(newsId);
        if (news) {
            this.streamVideo(-1, -1, news.path, 0, req, res, MediaType.OTHER);
        } else {
            throw new NotFoundException();
        }
    }

    private async streamVideo(userId: number, mediaId: number, path: string, videoDuration: number, req: Request, res: Response, mediaType: MediaType): Promise<any> {
        let stream: fs.ReadStream | null = null;

        try {
            if (!path || !this.fileExists(path)) {
                return res.status(404).send('File not found');
            }

            const stat = fs.statSync(path);
            const fileSize = stat.size;
            const range = req.headers.range;
            videoDuration = videoDuration / 1000;

            if (!range) {
                throw new NotAcceptableException('Range header required');
            }

            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);

            if (isNaN(start) || start >= fileSize) {
                res.status(416).set({ 'Content-Range': `bytes */${fileSize}` });
                return res.send('Requested range not satisfiable');
            }

            // Fix 1 : Limiter la taille du chunk
            const requestedEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const end = Math.min(
                requestedEnd,
                start + this.MAX_CHUNK_SIZE - 1,
                fileSize - 1
            );

            if (end < start) {
                res.status(416).set({ 'Content-Range': `bytes */${fileSize}` });
                return res.send('Requested range not satisfiable');
            }

            const chunkSize = end - start + 1;

            // Fix 2 : Créer le stream avec highWaterMark contrôlé
            stream = fs.createReadStream(path, {
                start,
                end,
                highWaterMark: 1024 * 1024, // Lecture par morceaux de 1 Mo
            });

            res.status(206).set({
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/x-matroska',
            });

            let bytesStreamed = 0;

            stream.on('data', (chunk: Buffer) => {
                bytesStreamed += chunk.length;
            });

            stream.on('error', (error: Error) => {
                console.error(`[StreamVideo] Stream error: ${error.message}`);
                // Fix 3 : Détruire proprement le stream en cas d'erreur
                stream?.destroy();
                if (!res.headersSent) {
                    res.status(500).send('Stream error');
                }
            });

            // Fix 3 : Détruire le stream quand le client se déconnecte
            req.on('close', () => {
                stream?.destroy();
            });

            res.on('close', () => {
                // Fix 3 : Stopper la lecture disque immédiatement
                stream?.destroy();

                // Fix 4 : Calcul de progression basé sur la position réelle
                const lastBytePosition = start + bytesStreamed;
                const watchProgress = (lastBytePosition / fileSize) * 100;

                if (watchProgress < 0 || watchProgress > 100) return;

                if (mediaType === MediaType.MOVIE) {
                    this.statUserService.saveStatUserForMovie(userId, mediaId, watchProgress);
                } else if (mediaType === MediaType.EPISODE) {
                    this.statUserService.saveStatUserForEpisode(userId, mediaId, watchProgress);
                }
            });

            stream.pipe(res);

        } catch (error) {
            stream?.destroy();
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    }

}
