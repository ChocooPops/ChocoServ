import { Injectable, NotFoundException } from '@nestjs/common';
import { Movie } from 'src/movie/dto/movie.interface';
import { MovieService } from 'src/movie/service/movie.service';
import { Episode } from 'src/series/dto/episode.interface';
import { SeriesService } from 'src/series/service/series.service';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

@Injectable()
export class DownloadService {


    constructor(private readonly movieService: MovieService,
        private readonly seriesService: SeriesService
    ) { }

    private getFilePath(filename: string): string {
        return path.join(filename);
    }

    private fileExists(filename: string): boolean {
        return fs.existsSync(this.getFilePath(filename));
    }

    public async downloadMovie(movieId: number, res: Response): Promise<any> {
        const movie: Movie = await this.movieService.getSimpleMediaById(movieId) as Movie;
        if (movie) {
            this.downloadVideo(movie.path, res);
        } else {
            throw new NotFoundException();
        }
    }

    public async downloadEpisode(episodeId: number, res: Response): Promise<any> {
        const episode: Episode = await this.seriesService.getSimpleEpisodeById(episodeId);
        if (episode) {
            this.downloadVideo(episode.path, res);
        } else {
            throw new NotFoundException();
        }
    }

    private downloadVideo(filePath: string, res: Response): void {
        let stream: fs.ReadStream | null = null;

        try {
            if (!filePath || !this.fileExists(filePath)) {
                res.status(404).send('File not found');
                return;
            }

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const originalFileName = path.basename(filePath);

            // Content-Length allows the client to calculate download progress
            // (bytes received / total size). X-File-Name provides the original name
            // in encoded form (HTTP headers do not support characters outside the Latin1 character set).
            res.status(200).set({
                'Content-Length': fileSize,
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${this.sanitizeFileName(originalFileName)}"; filename*=UTF-8''${encodeURIComponent(originalFileName)}`,
                'X-File-Name': encodeURIComponent(originalFileName),
            });

            stream = fs.createReadStream(filePath, {
                highWaterMark: 1024 * 1024, // Read in 1 MB chunks
            });

            stream.on('error', (error: Error) => {
                console.error(`[downloadVideo] Stream error: ${error.message}`);
                stream?.destroy();
                if (!res.headersSent) {
                    res.status(500).send('Stream error');
                }
            });

            res.on('close', () => {
                stream?.destroy();
            });

            stream.pipe(res);

        } catch (error) {
            stream?.destroy();
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    }

    private sanitizeFileName(name: string): string {
        return (name ?? 'video').replace(/[\\/:*?"<>|]/g, '_').replace(/[^\x20-\x7E]/g, '_');
    }

}
