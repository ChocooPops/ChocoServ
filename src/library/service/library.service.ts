import { forwardRef, Inject, Injectable } from '@nestjs/common';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { Library } from '../dto/library.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { ParseFilePathService } from 'src/common-service/parse-file-path.service';
import { ParsedName } from '../dto/parsed-name';
import { basename } from 'path';
import { MediaType } from 'src/media/dto/media-type.enum';
import { TmdbService } from 'src/tmdb/service/tmdb.service';
import { MediaMetadata } from '../dto/media-metadata.interface';
import * as fs from 'fs/promises';
import { statSync } from 'fs';
import { promisify } from "util";
import { exec } from 'child_process';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaLibrary } from '../dto/media-library.interface';
import { StateLibrary } from '../dto/state-library.enum';
import { Media } from 'src/media/dto/media.interface';
import { EditMovie } from 'src/movie/dto/edit-movie.interface';
import { ISO_3166_1 } from 'src/media/dto/iso-3166-1.enum';
import { Movie } from 'src/movie/dto/movie.interface';
const execPromise = promisify(exec);

@Injectable()
export class LibraryService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly parseFilePathService: ParseFilePathService,
        @Inject(forwardRef(() => TmdbService))
        private readonly tmdbService: TmdbService,
        @Inject(forwardRef(() => MovieService))
        private readonly movieService: MovieService,
        @Inject(forwardRef(() => SeriesService))
        private readonly seriesService: SeriesService) { } 


    // ==============================================
    // FONCTION USED INTO TMDB MODULE
    // ==============================================
    public async getMediaLibraryIdByTmdbId(tmdbId: number): Promise<string | null> {
        try {
            const query: string = `SELECT id FROM Media_Library WHERE tmdbId = ? LIMIT 1;`;
            const result: MediaLibrary[] = await this.pool.query(query, [tmdbId]);
            return result[0].id ?? null;
        } catch(error) {
            return null;
        }
    }
    public async getTmdbIdByMediaLibrary(mediaLibraryId: string): Promise<number | null> {
        try {
            const query: string = `SELECT tmdbId FROM Media_Library WHERE id = ? LIMIT 1;`;
            const result: MediaLibrary[] = await this.pool.query(query, [mediaLibraryId]);
            return result[0].tmdbId ?? null;
        } catch(error) {
            return null;
        }
    }
    public async getLanguageByMediaLibraryTmdbId(tmdbId: number): Promise<ISO_3166_1> {
        try {
            const query: string = `SELECT l.* FROM Media_Library ml
                LEFT JOIN Library l ON l.id = ml.libraryId
                WHERE ml.tmdbId = ?`;
            const result: Library[] = await this.pool.query(query, [tmdbId]);
            return result[0].lang ?? null;
        } catch(error) {
            return null
        }
    }

    public async getAllLibrary(): Promise<Library[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT * FROM Library ORDER BY createdAt asc`;
            const libraries: Library[] = await conn.query(query);
            return libraries;
        } catch(error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getAllMediaLibraryByLibraryId(libraryId: string): Promise<MediaLibrary[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `SELECT ml.* FROM Media_Library ml
                INNER JOIN Library l ON l.id = ml.libraryId AND l.state = ?
                WHERE libraryId = ? ORDER BY updatedAt desc`;
            const mediaLibraries: MediaLibrary[] = await conn.query(query, [StateLibrary.NOT_WORKED, libraryId]);
            return mediaLibraries;
        } catch(error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async insertNewLibrary(library: Library): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const pathExists: boolean = await this.pathExists(library.path);
            if (pathExists) {
                await conn.beginTransaction();
                const id: string = this.generateIdUuid();
                const query: string = `
                    INSERT INTO Library 
                    (id, path, mediaType, lang)
                    VALUES (?, ?, ?, ?)`;
                await conn.query(query, [id, library.path, library.mediaType, library.lang]);
                await conn.commit();

                const libraryInserted: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [id]);
                
                return {
                    id: 0,
                    state: true,
                    message: `Librairie inséré avec succès`,
                    other: libraryInserted[0]
                }

            } else {
                return {
                    id: -1,
                    state: false,
                    message: `Le chemin de la librairie n'existe pas sur le serveur`
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Error : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async refreshLibrary(libraryId: string, mediaType: MediaType): Promise<any> {
        if (mediaType === MediaType.MOVIE) {
            return await this.refreshLibraryMovies(libraryId);
        } else if (mediaType === MediaType.SERIES) {

        } else {
            return {
                id: -1,
                state: false,
                message: `Aucune librarie n'est associé à ce type`
            }
        }
    }

    public async refreshLibraryMovies(libraryId: string): Promise<any> {
        const conn = await this.pool.getConnection();
        try {

            const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [libraryId]);
            let message: any;

            if (libraries.length > 0) {

                if (libraries[0].state === StateLibrary.IN_PROGRESS) {
                    message = {
                        id: -1,
                        state: false,
                        message: `La librairie est déjà entrain de charger`
                    }
                } else {
                    await conn.query('UPDATE Library SET state = ? WHERE id = ?', [StateLibrary.IN_PROGRESS, libraryId]);

                    await conn.beginTransaction();

                    const path: string = libraries[0].path;
                    const mediaType: MediaType = libraries[0].mediaType;
                    const lang: ISO_3166_1 = libraries[0].lang;

                    const mediaLibraries: MediaLibrary[] = await conn.query(`SELECT id, path FROM Media_Library WHERE libraryId = ?`, [libraryId]);
                    const mediasPath: string[] = await this.getAllVideoFiles(path);

                    // ==============================
                    // NORMALISATION
                    // ==============================
                    const mediaLibraryPaths = new Set(
                        mediaLibraries.map((item) =>
                            this.normalizePath(item.path),
                        ),
                    );
                    const mediasPathSet = new Set(
                        mediasPath.map((p) =>
                            this.normalizePath(p),
                        ),
                    );

                    // ==============================
                    // À GARDER
                    // ==============================
                    const mediasKeepingInserted: any[] = [];
                    const mediaLibrariesKeep: MediaLibrary[] = mediaLibraries.filter(
                    (item) =>
                        mediasPathSet.has(
                            this.normalizePath(item.path),
                        ),
                    );
                    const messageKeeping: any[] = [];

                    if (mediaLibrariesKeep.length > 0) {
                        const query: string = `SELECT ml.id, ml.tmdbId
                            FROM Media_Library ml
                            WHERE ml.id IN (${mediaLibrariesKeep.map(() => '?').join(', ')})
                            AND NOT EXISTS (
                                SELECT 1
                                FROM Media m
                                WHERE m.mediaLibraryId = ml.id
                            );`;
                        const mediaLibraryNotDownload: MediaLibrary[] = await conn.query(query, mediaLibrariesKeep.map((item) => item.id));
                        for (let mediaLibrary of mediaLibraryNotDownload) {
                            try {
                                const editMovie: EditMovie = await this.tmdbService.searchMovieByTmdbId(mediaLibrary.tmdbId, lang);
                                const message: ReturnMessage = await this.movieService.insertNewMovie(editMovie, false);
                                mediasKeepingInserted.push(message);
                            } catch(error: any) {
                                mediasKeepingInserted.push(`${error}`);
                            }
                        }
                        messageKeeping.push({
                            media_library_keeping: mediaLibrariesKeep,
                            medias_keeping_inserted: mediasKeepingInserted
                        })
                    }

                    // ==============================
                    // À SUPPRIMER
                    // ==============================
                    const mediasDeleted: any[] = [];
                    const messagesDeleted: any[] = [];

                    const mediaLibrariesDelete = mediaLibraries.filter(
                    (item) =>
                        !mediasPathSet.has(
                        this.normalizePath(item.path),
                        ),
                    );
                    if (mediaLibrariesDelete.length > 0) {
                        const medias: Media[] = await conn.query(`SELECT id, mediaType FROM Media WHERE mediaLibraryId IN 
                            (${mediaLibrariesDelete.map(() => '?').join(', ')})`,
                            mediaLibrariesDelete.map((item) => item.id));
                    
                        for(let media of medias) {
                            if (media.mediaType === MediaType.MOVIE) {
                                const message = await this.movieService.deleteMovieById(media.id);
                                mediasDeleted.push(message);
                            } else if (media.mediaType === MediaType.SERIES) {
                                const message = await this.seriesService.deleteSeriesById(media.id);
                                mediasDeleted.push(message);
                            }
                        }
                        
                        await conn.query(`DELETE FROM Media_Library WHERE id IN 
                            (${mediaLibrariesDelete.map(() => '?').join(', ')})`,
                            mediaLibrariesDelete.map((item) => item.id));
                        messagesDeleted.push({
                            media_library_deleting: mediaLibrariesDelete,
                            medias_deleted: mediasDeleted
                        });
                    }

                    // ==============================
                    // À AJOUTER
                    // ==============================
                    const messageInserted: any[] = [];
                    const mediasLibraryInserted: any[] = [];
                    const messagesMediaInserted: any[] = [];

                    const tmdbToInsert: number[] = [];
                    const mediaLibrariesAdd = mediasPath.filter(
                    (mediaPath) =>
                        !mediaLibraryPaths.has(
                        this.normalizePath(mediaPath),
                        ),
                    );
                    const parsedNameTab: ParsedName[] = [];
                    mediaLibrariesAdd.forEach((path: string) => {
                        const result: ParsedName = this.parseFilePathService.getCleanMediaTitle(basename(path))
                        parsedNameTab.push({
                            name: result.name,
                            year: result.year,
                            path: path
                        });
                    });
                    if (mediaType === MediaType.MOVIE) {
                        for(let parsedName of parsedNameTab) {
                            try {
                                const tmdbId: number = await this.tmdbService.getTmdbIdForMovieByTitleAndYear(parsedName.name, parsedName.year);
                                if (tmdbId && tmdbId > 0) tmdbToInsert.push(tmdbId);
                                const metadata: MediaMetadata = await this.extractMediaMetadata(parsedName.path);
                                const id: string = this.generateIdUuid();
                                const query: string = `
                                    INSERT INTO Media_Library
                                    (id, titleFormated, year, path, type, tmdbId, libraryId,
                                    duration, frames, bytes, width, height, resolution)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                                await conn.query(query, [id, parsedName.name, parsedName.year ?? 0, 
                                    parsedName.path, MediaType.MOVIE, tmdbId, libraryId,
                                    metadata.duration ?? 0, metadata.frames ?? 0, metadata.bytes ?? 0, metadata.width ?? 0, metadata.height ?? 0, metadata.resolution ?? 0]);
                                mediasLibraryInserted.push(`Succès ${parsedName.name} (${parsedName.year}) [${parsedName.path}] => TMDB_ID (${tmdbId}), duration (${metadata.duration}), frames (${metadata.frames}), bytes (${metadata.bytes})`)
                            } catch(error) {
                                mediasLibraryInserted.push(`Error ${parsedName.name} (${parsedName.year}) [${parsedName.path}] => ${error}`);
                            }
                        }
                        await conn.commit();
                        await conn.release();
                        for (let tmdbId of tmdbToInsert) {
                            try {
                                const editMovie: EditMovie = await this.tmdbService.searchMovieByTmdbId(tmdbId, lang);
                                const message: ReturnMessage = await this.movieService.insertNewMovie(editMovie, false);
                                messagesMediaInserted.push(message);
                            } catch(error: any) {
                                messagesMediaInserted.push(`${error}`);
                            }
                        }
                        messageInserted.push({
                            media_library: mediasLibraryInserted,
                            medias: messagesMediaInserted
                        });
                    }
                    await conn.commit();
                    message = {
                        keeping: messageKeeping,
                        inserted: messageInserted,
                        deleting: messagesDeleted,
                    };
                }
            } else {
                message = {
                    id: -1,
                    state: false,
                    message: `Librairie introuvable, id incorrect`
                }
            }
            await this.pool.query(`UPDATE Library SET log = ? WHERE id = ?`, [JSON.stringify(message), libraryId]);
            return message;
        } catch(error: any) {
            const message: ReturnMessage = {
                id: -1,
                state: false,
                message: error
            }
            await conn.rollback();
            await this.pool.query(`UPDATE Library SET log = ? WHERE id = ?`, [JSON.stringify(message), libraryId]);
            return message;
        } finally {
            await conn.release();
            await this.pool.query('UPDATE Library SET state = ? WHERE id = ?', [StateLibrary.NOT_WORKED, libraryId]);
        }
    }

    public async modifyMediaLibrary(editMediaLibrary: MediaLibrary): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const mediaLibraries: MediaLibrary[] = await conn.query(`SELECT * FROM Media_Library WHERE id = ?`, [editMediaLibrary.id]);
            if (mediaLibraries.length > 0) {
                const mediaLibrary: MediaLibrary = mediaLibraries[0];
                const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [mediaLibrary.libraryId]);
                const library: Library = libraries[0];
                if (library.mediaType === MediaType.MOVIE) {
                     return await this.modifyMovieLibrary(editMediaLibrary, mediaLibrary, library, conn);
                } else if (library.mediaType === MediaType.SERIES) {

                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: `Médiathèque introuvable, id incorrect`
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Error : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    private async modifyMovieLibrary(editMediaLibrary: MediaLibrary, mediaLibrary: MediaLibrary, library: Library, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        if (mediaLibrary.tmdbId !== editMediaLibrary.tmdbId) {
            const movies: Movie[] = await conn.query(`SELECT id FROM Media WHERE mediaLibraryId = ?`, [editMediaLibrary.id]);
            const movieTmdb: EditMovie = await this.tmdbService.searchMovieByTmdbId(editMediaLibrary.tmdbId, library.lang);
            let messageMovie!: ReturnMessage;
            movieTmdb.mediaLibraryId = editMediaLibrary.id;
            if (movies.length > 0) {
                movieTmdb.id = movies[0].id;
                messageMovie = await this.movieService.updateMovie(movieTmdb);
            } else {
                messageMovie = await this.movieService.insertNewMovie(movieTmdb, true);
            }
            if (messageMovie.state) {
                await conn.query(`UPDATE Media_Library SET tmdbId = ? WHERE id = ?`, [editMediaLibrary.tmdbId, editMediaLibrary.id]);
                await conn.commit();
                return {
                    id: -1,
                    state: true,
                    message: `Meta-données du film modifées`
                }
            } else {
                return messageMovie;
            }
        } else {
            return {
                id: -1,
                state: false,
                message: `Aucune modification`
            }
        }
    }

    public async deleteLibraryById(id: string): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            let messages: ReturnMessage;
            const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [id]);

            if (libraries.length > 0) {
                if (libraries[0].state === StateLibrary.NOT_WORKED) {
                    
                    const messagesDeleted: any[] = [];
                    const medias: Media[] = await conn.query(`SELECT m.* FROM Media m
                        INNER JOIN Media_Library mlib ON mlib.libraryId = ?`, [id]);

                    for(let media of medias) {
                        if (media.mediaType === MediaType.MOVIE) {
                            const message = await this.movieService.deleteMovieById(media.id);
                            messagesDeleted.push(message);
                        } else if (media.mediaType === MediaType.SERIES) {
                            const message = await this.seriesService.deleteSeriesById(media.id);
                            messagesDeleted.push(message);
                        }
                    }    

                    const resultMediaLibrary = await conn.query(`DELETE FROM Media_Library WHERE libraryId = ?`, [id]);
                    const resultLibrary = await conn.query(`DELETE FROM Library WHERE id = ?`, [id]);
                    const message: string = `Media Librairie supprimé (${resultMediaLibrary.affectedRows}) \n librairie supprimé (${resultLibrary.affectedRows})`;
                    await conn.commit();

                    messages = {
                        id: 0,
                        state: true,
                        message: message,
                        other: messagesDeleted
                    }
                } else {
                    messages = {
                        id: -1,
                        state: false,
                        message: `Suppression impossible, la librairie est entrain de se charger` 
                    }
                }
            } else {
                messages = {
                    id: -1,
                    state: false,
                    message: `Librairie introuvable, id incorrect` 
                }
            }

            if (messages.state) {
                await this.pool.query(`UPDATE Library SET log = ? WHERE id = ?`, [JSON.stringify(messages), id]);
            }
            return messages;
        } catch(error: any) {
            const messages = {
                id: -1,
                state: false,
                message: `Error : ${error.sqlMessage}`
            }
            await conn.rollback();
            await this.pool.query(`UPDATE Library SET log = ? WHERE id = ?`, [JSON.stringify(messages), id]);
            return messages;
        } finally {
            await conn.release();
        }
    }

    private generateIdUuid(): string {
        return uuidv4();
    }

    private async pathExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    private async getAllVideoFiles(dir: string): Promise<string[]> {
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(
            entries.map(async (entry) => {
            const fullPath = path.resolve(dir, entry.name);

            if (entry.isDirectory()) {
                return this.getAllVideoFiles(fullPath);
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (videoExtensions.includes(ext)) {
                    return fullPath;
                }
                return null;
            }
            })
        );

        return files.flat().filter(Boolean);
    }
    
    private getResolutionLabel(width: number, height: number): string {
        if (width >= 3840 || height >= 2160) return '4K';
        if (width >= 1920 || height >= 1080) return 'Full HD';
        if (width >= 1280 || height >= 720) return '720p';
        if (width >= 854 || height >= 480) return '480p';
        if (width >= 640 || height >= 360) return '360p';
        return 'SD';
    }

    private async extractMediaMetadata(filePath: string): Promise<MediaMetadata> {
        const bytes = BigInt(statSync(filePath).size);

        // Ajout de width et height dans -show_entries
        const command = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,nb_frames,width,height -show_entries format=duration -of json "${filePath}"`;
        const { stdout } = await execPromise(command);
        const probeData = JSON.parse(stdout);

        // Durée en millisecondes
        const durationSec: number = parseFloat(probeData.format?.duration ?? '0');
        const duration = BigInt(Math.round(durationSec * 1000));

        // Calcul des frames + résolution
        let frames = BigInt(0);
        let width = 0;
        let height = 0;
        const stream = probeData.streams?.[0];
        if (stream) {
            width = stream.width ?? 0;
            height = stream.height ?? 0;

            if (stream.nb_frames) {
                frames = BigInt(parseInt(stream.nb_frames));
            } else if (stream.r_frame_rate) {
                const [num, den] = stream.r_frame_rate.split('/').map(Number);
                const fps = den ? num / den : num;
                frames = BigInt(Math.round(fps * durationSec));
            }
        }

        const resolution = this.getResolutionLabel(width, height);

        return { duration, frames, bytes, width, height, resolution };
    }

    private normalizePath(filePath: string): string {
        return filePath
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/\/$/, '')
            .toLowerCase();
    }

}
