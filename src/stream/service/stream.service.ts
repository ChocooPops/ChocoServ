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
        try {
            if (!path || !this.fileExists(path)) {
                return res.status(404).send('File not found');
            }
            const stat = fs.statSync(path);
            const fileSize = stat.size;
            const range = req.headers.range;
            videoDuration = videoDuration / 10_000_00;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                if (start >= fileSize || end >= fileSize) {
                    res.status(416).set({
                        'Content-Range': `bytes */${fileSize}`
                    });
                    return res.send('Requested range not satisfiable');
                }

                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(path, { start, end });

                res.status(206);
                res.set({
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/x-matroska',
                });

                let bytesStreamed = 0;

                stream.on('data', (chunk) => {
                    bytesStreamed += chunk.length;
                });

                stream.on('error', (error) => {
                    if (!res.headersSent) {
                        res.status(500).send('Stream error');
                    }
                });

                res.on('close', () => {
                    const lastBytePosition = start + bytesStreamed;
                    const byteProgress = lastBytePosition / fileSize;
                    const watchProgress = byteProgress * 100;

                    if (watchProgress < 0) return;

                    if (mediaType === MediaType.MOVIE) {
                        this.statUserService.saveStatUserForMovie(userId, mediaId, watchProgress);
                    } else if (mediaType === MediaType.EPISODE) {
                        this.statUserService.saveStatUserForEpisode(userId, mediaId, watchProgress);
                    }
                });

                stream.pipe(res);

            } else {
                throw new NotAcceptableException('Not range acceptable');
            }
        } catch (error) {
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    }

}
