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
import { SeriesScannerService, ScannedSeries } from 'src/common-service/series-scanner.service';
import { EditSeries } from 'src/series/dto/edit-series.interface';

@Injectable()
export class LibraryService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly parseFilePathService: ParseFilePathService,
        private readonly seriesScannerService: SeriesScannerService,
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
            const query: string = `
                SELECT ml.*
                FROM Media_Library ml
                INNER JOIN Library l ON l.id = ml.libraryId AND l.state = ?
                WHERE ml.libraryId = ?`;

            const mediaLibraries: MediaLibrary[] = await conn.query(query, [StateLibrary.NOT_WORKED, libraryId]);

            const isSeriesLibrary = mediaLibraries.some((ml) => ml.type === 'SERIES');
            if (!isSeriesLibrary) {
                return mediaLibraries.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
            }

            const byId = new Map<string, MediaLibrary>(
                mediaLibraries.map((ml) => [ml.id, ml])
            );

            const series  = mediaLibraries.filter((ml) => ml.type === 'SERIES');
            const seasons = mediaLibraries.filter((ml) => ml.type === 'SEASON');
            const episodes = mediaLibraries.filter((ml) => ml.type === 'EPISODE');

            const seasonsBySeries = new Map<string, MediaLibrary[]>();
            for (const season of seasons) {
                const key = season.parentId ?? '__orphan__';
                if (!seasonsBySeries.has(key)) seasonsBySeries.set(key, []);
                seasonsBySeries.get(key)!.push(season);
            }

            const episodesBySeason = new Map<string, MediaLibrary[]>();
            for (const episode of episodes) {
                const key = episode.parentId ?? '__orphan__';
                if (!episodesBySeason.has(key)) episodesBySeason.set(key, []);
                episodesBySeason.get(key)!.push(episode);
            }

            series.sort((a, b) =>
                (a.titleFormated ?? '').localeCompare(b.titleFormated ?? '', undefined, { sensitivity: 'base' })
            );

            const result: MediaLibrary[] = [];

            for (const serie of series) {
                result.push(serie);

                const serieSeasons = seasonsBySeries.get(serie.id) ?? [];

                serieSeasons.sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0));

                for (const season of serieSeasons) {
                    result.push(season);

                    const seasonEpisodes = episodesBySeason.get(season.id) ?? [];

                    seasonEpisodes.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));

                    result.push(...seasonEpisodes);
                }
            }

            const resultIds = new Set(result.map((ml) => ml.id));
            const orphans = mediaLibraries.filter((ml) => !resultIds.has(ml.id));
            result.push(...orphans);

            return result;

        } catch (error) {
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
            return await this.refreshLibrarySeries(libraryId);
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
                                    parsedName.path, MediaType.MOVIE, tmdbId ?? 0, libraryId,
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
                    return await this.modifySeriesLibrary(editMediaLibrary, mediaLibrary, library, conn);
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
        const movies: Movie[] = await conn.query(`SELECT id FROM Media WHERE mediaLibraryId = ?`, [editMediaLibrary.id]);
        if (mediaLibrary.tmdbId !== editMediaLibrary.tmdbId || movies.length <= 0) {
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

    private async modifySeriesLibrary(editMediaLibrary: MediaLibrary, mediaLibrary: MediaLibrary, library: Library, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
    
        if (mediaLibrary.type !== 'SERIES') {
            return {
                id:      -1,
                state:   false,
                message: `Seules les lignes de type SERIES peuvent être modifiées`,
            };
        }
    
        const existingSeries: Media[] = await conn.query(
            `SELECT id FROM Media WHERE mediaLibraryId = ?`,
            [editMediaLibrary.id]
        );
    
        if (mediaLibrary.tmdbId !== editMediaLibrary.tmdbId || existingSeries.length <= 0) {
    
            const seriesTmdb: EditSeries = await this.tmdbService.searchSeriesByTmdbId(editMediaLibrary.tmdbId, library.lang);
            let messageSeries: ReturnMessage;
            seriesTmdb.mediaLibraryId = editMediaLibrary.id;
    
            if (existingSeries.length > 0) {
                seriesTmdb.id = existingSeries[0].id;
                messageSeries = await this.seriesService.updateSeries(seriesTmdb);
            } else {
                messageSeries = await this.seriesService.insertNewSeries(seriesTmdb, true);
            }

            if (messageSeries.state) {
    
                const childRows: { id: string }[] = await conn.query(
                    `SELECT id FROM Media_Library
                    WHERE parentId = ?
                        OR parentId IN (
                            SELECT id FROM Media_Library
                            WHERE parentId = ? AND type = 'SEASON'
                        )`,
                    [editMediaLibrary.id, editMediaLibrary.id]
                );
                const childIds: string[] = childRows.map((r) => r.id);
                
                await conn.query(
                    `UPDATE Media_Library SET tmdbId = ? WHERE id = ?`,
                    [editMediaLibrary.tmdbId, editMediaLibrary.id]
                );
                
                if (childIds.length > 0) {
                    await conn.query(
                        `UPDATE Media_Library SET tmdbId = ?
                        WHERE id IN (${childIds.map(() => '?').join(',')})`,
                        [editMediaLibrary.tmdbId, ...childIds]
                    );
                }
                
                const updatedIds: string[] = [editMediaLibrary.id, ...childIds];
    
                await conn.commit();
                return {
                    id:      -1,
                    state:   true,
                    message: `Meta-données de la série modifiées`,
                    other: updatedIds
                };
    
            } else {
                return messageSeries;
            }
    
        } else {
            return {
                id:      -1,
                state:   false,
                message: `Aucune modification`,
            };
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

        const entries = await fs.readdir(dir, {
            withFileTypes: true,
        });

        const files = await Promise.all(
            entries.map(async (entry) => {
                const fullPath = path.resolve(dir, entry.name);

                if (entry.isSymbolicLink()) {
                    return [];
                }

                if (path.extname(entry.name).toLowerCase() === '.lnk') {
                    return [];
                }

                if (entry.isDirectory()) {
                    return this.getAllVideoFiles(fullPath);
                }

                const ext = path.extname(entry.name).toLowerCase();

                if (videoExtensions.includes(ext)) {
                    return fullPath;
                }

                return [];
            }),
        );

        return files.flat();
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

    public async refreshLibrarySeries(libraryId: string): Promise<any> {
        const conn = await this.pool.getConnection();
        try {
            // ── Chargement et garde ───────────────────────────────────────────
            const libraries: Library[] = await conn.query(
                `SELECT * FROM Library WHERE id = ?`, [libraryId]
            );
            if (libraries.length === 0) {
                return { id: -1, state: false, message: `Librairie introuvable` };
            }
            const library = libraries[0];
            if (library.state === StateLibrary.IN_PROGRESS) {
                return { id: -1, state: false, message: `La librairie est déjà entrain de charger` };
            }
    
            await conn.query('UPDATE Library SET state = ? WHERE id = ?', [StateLibrary.IN_PROGRESS, libraryId]);
            await conn.beginTransaction();
    
            const rootPath: string = library.path;
            const lang: ISO_3166_1 = library.lang;
    
            // ── 1. Scan du disque ─────────────────────────────────────────────
            const scannedSeries: ScannedSeries[] =
                await this.seriesScannerService.scanSeriesDirectory(rootPath);
    
            // ── 2. État actuel en base ────────────────────────────────────────
            const existingML: MediaLibrary[] = await conn.query(
                `SELECT id, path, type, tmdbId, parentId, seasonNumber, episodeNumber
                FROM Media_Library WHERE libraryId = ?`,
                [libraryId]
            );
            const existingMLByPath = new Map<string, MediaLibrary>(
                existingML.map((ml) => [this.normalizePath(ml.path), ml])
            );
    
            // Chemins vus sur le disque (détection des suppressions)
            const seenPaths = new Set<string>();
    
            const logInserted: any[] = [];
            const logKept:     any[] = [];
            const logTmdb:     any[] = [];
    
            // ── 3. Parcours des séries scannées ───────────────────────────────
            for (const series of scannedSeries) {
    
                seenPaths.add(this.normalizePath(series.folderPath));
    
                // ── 3a. SÉRIE ─────────────────────────────────────────────────
                const existingSeries = existingMLByPath.get(this.normalizePath(series.folderPath));
                let seriesMLId: string;
    
                if (existingSeries) {
                    seriesMLId = existingSeries.id;
                    logKept.push(`[SERIES] ${series.seriesTitle} (${series.year}) — conservé`);
                } else {
                    seriesMLId = this.generateIdUuid();
                    await conn.query(
                        `INSERT INTO Media_Library
                        (id, titleFormated, year, path, type, tmdbId, libraryId,
                        parentId, seasonNumber, episodeNumber,
                        duration, frames, bytes, width, height, resolution)
                        VALUES (?, ?, ?, ?, 'SERIES', ?, ?,
                                NULL, NULL, NULL,
                                0, 0, 0, 0, 0, 'SD')`,
                        [
                            seriesMLId,
                            series.seriesTitle,
                            series.year ?? 0,
                            series.folderPath,
                            0,          // tmdbId → mis à jour après recherche TMDB
                            libraryId,
                        ]
                    );
                    logInserted.push(`[SERIES] ${series.seriesTitle} (${series.year}) → ${seriesMLId}`);
                }
    
                // ── 3b. Recherche TMDB (uniquement si inconnu) ────────────────
                let seriesTmdbId = existingSeries?.tmdbId ?? 0;
                if (seriesTmdbId === 0) {
                    try {
                        seriesTmdbId = await this.tmdbService.getTmdbIdForSeriesByTitleAndYear(
                            series.seriesTitle, series.year
                        );
                        if (seriesTmdbId > 0) {
                            await conn.query(
                                `UPDATE Media_Library SET tmdbId = ? WHERE id = ?`,
                                [seriesTmdbId, seriesMLId]
                            );
                        }
                    } catch (e) {
                        logTmdb.push(`[SERIES TMDB] ${series.seriesTitle} — erreur: ${e}`);
                    }
                }
    
                // ── 3c. SAISONS ───────────────────────────────────────────────
                for (const season of series.seasons) {
    
                    seenPaths.add(this.normalizePath(season.folderPath));
    
                    const existingSeason = existingMLByPath.get(this.normalizePath(season.folderPath));
                    let seasonMLId: string;
    
                    if (existingSeason) {
                        seasonMLId = existingSeason.id;
                        logKept.push(`  [SEASON ${season.seasonNumber}] conservé`);
                    } else {
                        seasonMLId = this.generateIdUuid();
                        await conn.query(
                            `INSERT INTO Media_Library
                            (id, titleFormated, year, path, type, tmdbId, libraryId,
                            parentId, seasonNumber, episodeNumber,
                            duration, frames, bytes, width, height, resolution)
                            VALUES (?, ?, ?, ?, 'SEASON', ?, ?,
                                    ?, ?, NULL,
                                    0, 0, 0, 0, 0, 'SD')`,
                            [
                                seasonMLId,
                                `${series.seriesTitle} — Saison ${season.seasonNumber}`,
                                series.year ?? 0,
                                season.folderPath,
                                seriesTmdbId,
                                libraryId,
                                seriesMLId,          // parentId → pointe vers la SÉRIE
                                season.seasonNumber, // seasonNumber
                            ]
                        );
                        logInserted.push(
                            `  [SEASON ${season.seasonNumber}] ${season.folderPath} → ${seasonMLId} (parent: ${seriesMLId})`
                        );
                    }
    
                    // ── 3d. ÉPISODES ──────────────────────────────────────────
                    // parentId = seasonMLId  |  seasonNumber = N  |  episodeNumber = N
                    for (const episode of season.episodes) {
    
                        seenPaths.add(this.normalizePath(episode.filePath));
    
                        const existingEpisode = existingMLByPath.get(this.normalizePath(episode.filePath));
                        if (existingEpisode) {
                            logKept.push(
                                `    [EP ${episode.episodeNumber}] ${episode.filePath} — conservé`
                            );
                            continue;
                        }
    
                        try {
                            const metadata: MediaMetadata = await this.extractMediaMetadata(episode.filePath);
                            const episodeMLId = this.generateIdUuid();
    
                            await conn.query(
                                `INSERT INTO Media_Library
                                (id, titleFormated, year, path, type, tmdbId, libraryId,
                                parentId, seasonNumber, episodeNumber,
                                duration, frames, bytes, width, height, resolution)
                                VALUES (?, ?, ?, ?, 'EPISODE', ?, ?,
                                        ?, ?, ?,
                                        ?, ?, ?, ?, ?, ?)`,
                                [
                                    episodeMLId,
                                    `${series.seriesTitle} S${String(season.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`,
                                    series.year ?? 0,
                                    episode.filePath,
                                    seriesTmdbId,
                                    libraryId,
                                    seasonMLId,             // parentId → pointe vers la SAISON
                                    season.seasonNumber,    // seasonNumber  (redondant mais pratique pour les requêtes à plat)
                                    episode.episodeNumber,  // episodeNumber
                                    metadata.duration  ?? 0n,
                                    metadata.frames    ?? 0n,
                                    metadata.bytes     ?? 0n,
                                    metadata.width     ?? 0,
                                    metadata.height    ?? 0,
                                    metadata.resolution ?? 'SD',
                                ]
                            );
                            logInserted.push(
                                `    [EP ${episode.episodeNumber}] ${episode.filePath} → ${episodeMLId} (parent: ${seasonMLId}, ${metadata.duration}ms, ${metadata.resolution})`
                            );
                        } catch (e) {
                            logInserted.push(
                                `    [EP ${episode.episodeNumber}] ${episode.filePath} — ERREUR metadata: ${e}`
                            );
                        }
                    }
                }
            }
    
            // ── 4. Suppressions ───────────────────────────────────────────────
            const logDeleted: any[] = [];
            const toDelete = existingML.filter(
                (ml) => !seenPaths.has(this.normalizePath(ml.path))
            );
    
            if (toDelete.length > 0) {
                // Supprimer d'abord les entités Media liées aux SERIES supprimées.
                const seriesMLIdsToDelete = toDelete
                    .filter((ml) => ml.type === 'SERIES')
                    .map((ml) => ml.id);
    
                if (seriesMLIdsToDelete.length > 0) {
                    const mediasToDelete: Media[] = await conn.query(
                        `SELECT id, mediaType FROM Media
                        WHERE mediaLibraryId IN (${seriesMLIdsToDelete.map(() => '?').join(',')})`,
                        seriesMLIdsToDelete
                    );
                    for (const media of mediasToDelete) {
                        if (media.mediaType === MediaType.SERIES) {
                            const msg = await this.seriesService.deleteSeriesById(media.id);
                            logDeleted.push(msg);
                        }
                    }
                }
    
                // Suppression des lignes Media_Library.
                const toDeleteIds = toDelete.map((ml) => ml.id);
                await conn.query(
                    `DELETE FROM Media_Library
                    WHERE id IN (${toDeleteIds.map(() => '?').join(',')})`,
                    toDeleteIds
                );
                logDeleted.push(...toDelete.map((ml) => `[DEL] ${ml.type} ${ml.path}`));
            }
    
            await conn.commit();
    
            // ── 5. Phase TMDB hors transaction (peut être longue) ────────────
            await conn.release();
    
            const seriesWithoutMedia: MediaLibrary[] = await this.pool.query(
                `SELECT ml.id, ml.tmdbId FROM Media_Library ml
                WHERE ml.libraryId = ? AND ml.type = 'SERIES'
                AND ml.tmdbId > 0
                AND NOT EXISTS (
                    SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml.id
                )`,
                [libraryId]
            );
    
            for (const ml of seriesWithoutMedia) {
                try {
                    const editSeries = await this.tmdbService.searchSeriesByTmdbId(ml.tmdbId, lang);
                    editSeries.mediaLibraryId = ml.id;
                    const msg = await this.seriesService.insertNewSeries(editSeries, true);
                    logTmdb.push(msg);
                } catch (e) {
                    logTmdb.push(`[TMDB] tmdbId=${ml.tmdbId} — erreur: ${e}`);
                }
            }
    
            const result = {
                state: true,
                inserted: logInserted,
                kept:     logKept,
                deleted:  logDeleted,
                tmdb:     logTmdb,
            };
            await this.pool.query(
                `UPDATE Library SET log = ? WHERE id = ?`,
                [JSON.stringify(result), libraryId]
            );
            return result;
    
        } catch (error: any) {
            const result: ReturnMessage = { id: -1, state: false, message: `Error: ${error?.message ?? error}` };
            await conn.rollback();
            await this.pool.query(`UPDATE Library SET log = ? WHERE id = ?`, [JSON.stringify(result), libraryId]);
            return result;
        } finally {
            try { await conn.release(); } catch {}
            await this.pool.query('UPDATE Library SET state = ? WHERE id = ?', [StateLibrary.NOT_WORKED, libraryId]);
        }
    }

    public async getSeriesMediaLibraryMaps(seriesTmdbId: number): Promise<{
        seriesML:               MediaLibrary | null;
        seasonByNumber:         Map<number, MediaLibrary>;
        episodeBySeasonAndNum:  Map<string,  MediaLibrary>;
    }> {
        const conn = await this.pool.getConnection();
        try {
            const rows: MediaLibrary[] = await conn.query(
                `SELECT id, type, parentId, seasonNumber, episodeNumber, path
                FROM Media_Library
                WHERE tmdbId = ? AND type IN ('SERIES', 'SEASON', 'EPISODE')`,
                [seriesTmdbId]
            );
    
            let seriesML: MediaLibrary | null = null;
            const seasonByNumber        = new Map<number, MediaLibrary>();
            const episodeBySeasonAndNum = new Map<string,  MediaLibrary>();
    
            for (const row of rows) {
                if (row.type === 'SERIES') {
                    seriesML = row;
                } else if (row.type === 'SEASON' && row.seasonNumber != null) {
                    seasonByNumber.set(row.seasonNumber, row);
                } else if (row.type === 'EPISODE' && row.seasonNumber != null && row.episodeNumber != null) {
                    episodeBySeasonAndNum.set(`${row.seasonNumber}_${row.episodeNumber}`, row);
                }
            }
    
            return { seriesML, seasonByNumber, episodeBySeasonAndNum };
        } catch {
            return {
                seriesML: null,
                seasonByNumber:        new Map(),
                episodeBySeasonAndNum: new Map(),
            };
        } finally {
            await conn.release();
        }
    }

}
