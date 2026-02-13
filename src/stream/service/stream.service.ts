import { Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { Media } from 'src/media/dto/media.interface';
import * as fs from 'fs';
import { Response, Request } from 'express';
import { Episode } from 'src/series/dto/episode.interface';
import { NewsVideoRunning } from 'src/news-video-running/dto/news-video-running.interface';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { NewsVideoRunningService } from 'src/news-video-running/service/news-video-running.service';
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { MediaType } from 'src/media/dto/media-type.enum';

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

    public async streamMovie(userId: number, mediaId: number, req: Request, res: Response): Promise<any> {
        const media: Media = await this.movieService.getSimpleMediaById(mediaId);
        if (media) {
            this.streamVideo(userId, media.id, media.path, req, res, MediaType.MOVIE);
        } else {
            throw new NotFoundException();
        }
    }

    public async streamEpisode(userId: number, seasonId: number, episodeId: number, req: Request, res: Response): Promise<any> {
        let episode: Episode | null = null;
        if (episodeId && episodeId > 0) {
            episode = await this.seriesService.getSimpleEpisodeById(episodeId);
        } else {
            episode = await this.seriesService.getLastWatchedEpisode(userId, seasonId);
            if (!episode) {
                episode = await this.seriesService.getFirstEpisodeBySeason(seasonId);
            }
        }
        if (episode) {
            this.streamVideo(userId, episode.id, episode.path, req, res, MediaType.EPISODE);
        } else {
            throw new NotFoundException();
        }
    }

    public async streamNewVideoRunning(newsId: number, req: Request, res: Response): Promise<any> {
        const news: NewsVideoRunning = await this.newsVideoRunningService.getSimpleNewsRunningById(newsId);
        if (news) {
            this.streamVideo(-1, -1, news.path, req, res, MediaType.OTHER);
        } else {
            throw new NotFoundException();
        }
    }

    private async streamVideo(userId: number, mediaId: number, path: string, req: Request, res: Response, mediaType: MediaType): Promise<any> {
        try {
            if (!path || !this.fileExists(path)) {
                return res.status(404).send('File not found');
            }

            const stat = fs.statSync(path);
            const fileSize = stat.size;
            const range = req.headers.range;

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

                // Suivre les bytes streamés
                let bytesStreamed = 0;

                stream.on('data', (chunk) => {
                    bytesStreamed += chunk.length;
                });

                stream.on('error', (error) => {
                    if (!res.headersSent) {
                        res.status(500).send('Stream error');
                    }
                });

                // Quand le stream est interrompu
                res.on('close', () => {
                    stream.destroy();

                    // Calculer la position finale
                    const lastBytePosition = start + bytesStreamed;
                    const watchProgress = (lastBytePosition / fileSize) * 100;

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
