import { Injectable, Inject, NotAcceptableException } from '@nestjs/common';
import * as path from 'path';
import { JellyfinService } from 'src/jellyfin/service/jellyfin.service';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { Media } from 'src/media/dto/media.interface';
import * as fs from 'fs';
import { Response, Request } from 'express';
import { Episode } from 'src/series/dto/episode.interface';

@Injectable()
export class StreamService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly jellyfinService: JellyfinService) { }

    private getFilePath(filename: string): string {
        return path.join(filename);
    }
    private fileExists(filename: string): boolean {
        return fs.existsSync(this.getFilePath(filename));
    }

    public async streamMovie(mediaId: number, req: Request, res: Response): Promise<any> {
        try {
            const media: Media = (await this.pool.query(
                `SELECT id, jellyfinId, title, path FROM Media WHERE id = ?`,
                [mediaId]
            ))[0];

            if (!media) {
                return res.status(404).send('Media not found');
            }

            if (!media.path || !this.fileExists(media.path)) {
                return res.status(404).send('File not found');
            }

            const stat = fs.statSync(media.path);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                // Validation des valeurs
                if (start >= fileSize || end >= fileSize) {
                    res.status(416).set({
                        'Content-Range': `bytes */${fileSize}`
                    });
                    return res.send('Requested range not satisfiable');
                }

                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(media.path, { start, end });

                res.status(206);
                res.set({
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/x-matroska', // MKV mime type
                });

                stream.pipe(res);

                stream.on('error', (error) => {
                    console.error(`Stream error for ${media.path}:`, error);
                    if (!res.headersSent) {
                        res.status(500).send('Stream error');
                    }
                });

                res.on('close', () => {
                    stream.destroy();
                    console.log(`Streaming of ${media.path} interrupted (Range: ${start}-${end})`);
                });

            } else {
                throw new NotAcceptableException('Not range acceptable')
            }
        } catch (error) {
            console.error('Error streaming movie:', error);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    }

    public async streamEpisode(episodeId: number, req: Request, res: Response): Promise<any> {
        try {
            const episode: Episode = (await this.pool.query(
                `SELECT id, jellyfinId, name, path FROM Episode WHERE id = ?`,
                [episodeId]
            ))[0];
            if (!episode) {
                return res.status(404).send('Media not found');
            }


            episode.path = episode.path.replace("E:\\", "H:\\");

            if (!episode.path || !this.fileExists(episode.path)) {
                return res.status(404).send('File not found');
            }

            const stat = fs.statSync(episode.path);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                // Validation des valeurs
                if (start >= fileSize || end >= fileSize) {
                    res.status(416).set({
                        'Content-Range': `bytes */${fileSize}`
                    });
                    return res.send('Requested range not satisfiable');
                }

                const chunkSize = end - start + 1;
                const stream = fs.createReadStream(episode.path, { start, end });

                res.status(206);
                res.set({
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/x-matroska', // MKV mime type
                });

                stream.pipe(res);

                stream.on('error', (error) => {
                    console.error(`Stream error for ${episode.path}:`, error);
                    if (!res.headersSent) {
                        res.status(500).send('Stream error');
                    }
                });

                res.on('close', () => {
                    stream.destroy();
                    console.log(`Streaming of ${episode.path} interrupted (Range: ${start}-${end})`);
                });

            } else {
                throw new NotAcceptableException('Not range acceptable')
            }
        } catch (error) {
            console.error('Error streaming movie:', error);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    }

}
