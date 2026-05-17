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
import { Season } from 'src/series/dto/season.interface';
import { Episode } from 'src/series/dto/episode.interface';
import { EditEpisode } from 'src/series/dto/edit-episode.interface';
import { EditSeason } from 'src/series/dto/edit-season.interface';
import { Link } from 'src/common-interface/link.interface';
import { Node } from 'src/common-interface/node.interface';
import { I18nService } from 'nestjs-i18n';

interface OrphanMediaLibrary {
    id:             string;
    type:           string;
    path:           string;
    tmdbId:         number;
    libraryId:      string;
    parentId:       string | null;
    titleFormated:  string;
}

@Injectable()
export class LibraryService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly parseFilePathService: ParseFilePathService,
        private readonly seriesScannerService: SeriesScannerService,
        private readonly i18nService: I18nService,
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
            const query: string = `SELECT id FROM Media_Library WHERE tmdbId = ? AND (type = ? OR type = ?) LIMIT 1;`;
            const result: MediaLibrary[] = await this.pool.query(query, [tmdbId, MediaType.MOVIE, MediaType.SERIES]);
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

            const isSeriesLibrary = mediaLibraries.some((ml) => ml.type === MediaType.SERIES);
            if (!isSeriesLibrary) {
                return mediaLibraries.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
            }

            const byId = new Map<string, MediaLibrary>(
                mediaLibraries.map((ml) => [ml.id, ml])
            );

            const series  = mediaLibraries.filter((ml) => ml.type === MediaType.SERIES);
            const seasons = mediaLibraries.filter((ml) => ml.type === MediaType.SEASON);
            const episodes = mediaLibraries.filter((ml) => ml.type === MediaType.EPISODE);

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
                    message: this.i18nService.t("common.LIBRARY.LIBRARY_SUCCESSFULLY_LOADED"),
                    other: libraryInserted[0]
                }

            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.LIBRARY.LIBRARY_PATH_NOT_EXIST")
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t('common.ERROR')}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async refreshLibrary(libraryId: string, mediaType: MediaType): Promise<any> {
        if (mediaType === MediaType.MOVIE) {
            return await this.refreshLibraryMovies(libraryId, null);
        } else if (mediaType === MediaType.SERIES) {
            return await this.refreshLibrarySeries(libraryId, null);
        } else {
            return {
                id: -1,
                state: false,
                message: this.i18nService.t("common.LIBRARY.NO_LIBARY_ASSOCIATED_TYPE")
            }
        }
    }

    private async getIfLibraryIsUnlock(libraryId: string, conn: mariadb.PoolConnection): Promise<boolean> {
        const results: any[] = await conn.query(`
            SELECT DISTINCT l.*
            FROM Library l
            LEFT JOIN Media_Library ml ON ml.libraryId = l.id
            WHERE l.id = ?
            AND (
                l.state = ?
                OR ml.state = ?
            );`,
        [libraryId, StateLibrary.IN_PROGRESS, StateLibrary.IN_PROGRESS]);
        if (results.length > 0) {
            return false;
        } else {
            return true;
        }
    }

    private async lockLibrary(libraryId: string, conn: mariadb.PoolConnection): Promise<any> {
        return await conn.query(`UPDATE Library SET state = ? WHERE id = ?`, [StateLibrary.IN_PROGRESS, libraryId]);
    }
    private async unlockLibrary(libraryId: string, conn: mariadb.PoolConnection): Promise<any> {
        return await conn.query(`UPDATE Library SET state = ? WHERE id = ?`, [StateLibrary.NOT_WORKED, libraryId]);
    }

    public async refreshLibraryMovies(libraryId: string, mediaLibraryId: string | null): Promise<any> {
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

            const isUnlocked: boolean = await this.getIfLibraryIsUnlock(libraryId, conn);
            if (!isUnlocked) {
                return { id: -1, state: false, message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK") };
            }

            await this.lockLibrary(libraryId, conn);

            try {
                await conn.beginTransaction();

                const rootPath: string   = library.path;
                const lang: ISO_3166_1  = library.lang;

                const logKept:     any[] = [];
                const logInserted: any[] = [];
                const logDeleted:  any[] = [];
                const logTmdb:     any[] = [];

                // ── 1. État actuel en base + fichiers sur le disque ───────────────
                const existingML: MediaLibrary[] = await conn.query(
                    `SELECT id, path, tmdbId FROM Media_Library WHERE libraryId = ? ${mediaLibraryId ? 'AND id = ?': ''}`,
                    [libraryId, mediaLibraryId]
                );
                
                const diskPaths: string[] = await this.getAllVideoFiles(rootPath);

                const existingMLByPath = new Map<string, MediaLibrary>(
                    existingML.map((ml) => [this.normalizePath(ml.path), ml])
                );
                const diskPathSet = new Set(diskPaths.map((p) => this.normalizePath(p)));

                // ── 2. À GARDER — fichiers toujours présents sur le disque ────────
                const toKeep = existingML.filter((ml) => diskPathSet.has(this.normalizePath(ml.path)));
                logKept.push(`${toKeep.length} ${this.i18nService.t("common.LIBRARY.FILE_ALREADY_IN_DATABASE_RETAINED")}`);

                // Parmi ceux conservés : ceux qui n'ont pas encore de Media associé
                // (cas d'un refresh partiel précédent ayant échoué côté TMDB)
                if (toKeep.length > 0) {
                    const mlWithoutMedia: MediaLibrary[] = await conn.query(
                        `SELECT ml.id, ml.tmdbId FROM Media_Library ml
                        WHERE ml.id IN (${toKeep.map(() => '?').join(',')})
                        AND ml.tmdbId > 0
                        AND NOT EXISTS (SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml.id)`,
                        toKeep.map((ml) => ml.id)
                    );
                    for (const ml of mlWithoutMedia) {
                        try {
                            const editMovie: EditMovie = await this.tmdbService.searchMovieByTmdbId(ml.tmdbId, lang);
                            const msg: ReturnMessage   = await this.movieService.insertNewMovie(editMovie, false);
                            logKept.push(`${this.i18nService.t("common.LIBRARY.TMDB_RETRIEVED")} tmdbId=${ml.tmdbId} → ${msg.message}`);
                        } catch (e) {
                            logKept.push(`${this.i18nService.t("common.LIBRARY.TMDB_ERROR")} tmdbId=${ml.tmdbId} — ${e}`);
                        }
                    }
                }

                // ── 3. À SUPPRIMER — fichiers disparus du disque ──────────────────
                const toDelete = existingML.filter((ml) => !diskPathSet.has(this.normalizePath(ml.path)));

                if (toDelete.length > 0) {
                    const medias: Media[] = await conn.query(
                        `SELECT id, mediaType FROM Media
                        WHERE mediaLibraryId IN (${toDelete.map(() => '?').join(',')})`,
                        toDelete.map((ml) => ml.id)
                    );

                    for (const media of medias) {
                        try {
                            if (media.mediaType === MediaType.MOVIE) {
                                const msg = await this.movieService.deleteMovieById(media.id);
                                logDeleted.push(`${this.i18nService.t("common.LIBRARY.DELETED_MOVIE")} mediaId=${media.id} → ${msg.message}`);
                            }
                        } catch (e) {
                            logDeleted.push(`${this.i18nService.t("common.LIBRARY.DELETED_MOVIE_ERROR")} mediaId=${media.id} — ${e}`);
                        }
                    }

                    await conn.query(
                        `DELETE FROM Media_Library WHERE id IN (${toDelete.map(() => '?').join(',')})`,
                        toDelete.map((ml) => ml.id)
                    );
                    logDeleted.push(...toDelete.map((ml) => `${this.i18nService.t("common.LIBRARY.DEL_ML")} ${ml.path}`));
                }

                // ── 4. À AJOUTER — nouveaux fichiers pas encore en base ───────────
                const toAdd = mediaLibraryId ? [] : diskPaths.filter(
                    (p) => !existingMLByPath.has(this.normalizePath(p))
                );

                const tmdbToInsert: number[] = [];

                for (const filePath of toAdd) {
                    try {
                        const parsed: ParsedName = this.parseFilePathService.getCleanMediaTitle(
                            basename(filePath)
                        );

                        const tmdbId: number = await this.tmdbService.getTmdbIdForMovieByTitleAndYear(
                            parsed.name, parsed.year
                        );
                        if (tmdbId > 0) tmdbToInsert.push(tmdbId);

                        const metadata: MediaMetadata = await this.extractMediaMetadata(filePath);
                        const id: string = this.generateIdUuid();

                        await conn.query(
                            `INSERT INTO Media_Library
                            (id, titleFormated, year, path, type, tmdbId, libraryId,
                            duration, frames, bytes, width, height, resolution)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [id, parsed.name, parsed.year ?? 0, filePath,
                            MediaType.MOVIE, tmdbId ?? 0, libraryId,
                            metadata.duration  ?? 0n,
                            metadata.frames    ?? 0n,
                            metadata.bytes     ?? 0n,
                            metadata.width     ?? 0,
                            metadata.height    ?? 0,
                            metadata.resolution ?? 'SD']
                        );
                        logInserted.push(
                            `${this.i18nService.t("common.LIBRARY.ML")} ${parsed.name} (${parsed.year ?? '?'}) — tmdbId=${tmdbId}, ${metadata.duration}ms, ${metadata.resolution}, ${filePath}`
                        );
                    } catch (e) {
                        logInserted.push(`${this.i18nService.t("common.LIBRARY.ML_ERROR")} ${filePath} — ${e}`);
                    }
                }

                await conn.commit();

                // ── 5. Phase TMDB hors transaction ────────────────────────────────
                await conn.release();

                for (const tmdbId of tmdbToInsert) {
                    try {
                        const editMovie: EditMovie = await this.tmdbService.searchMovieByTmdbId(tmdbId, lang);
                        const msg: ReturnMessage   = await this.movieService.insertNewMovie(editMovie, false);
                        logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_INSERT")} tmdbId=${tmdbId} → ${msg.message}`);
                    } catch (e) {
                        logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_INSERT_ERROR")} tmdbId=${tmdbId} — ${e}`);
                    }
                }

                const result = {
                    state:    true,
                    kept:     logKept,
                    inserted: logInserted,
                    deleted:  logDeleted,
                    tmdb:     logTmdb,
                    summary: {
                        kept:     toKeep.length,
                        inserted: toAdd.length,
                        deleted:  toDelete.length,
                        tmdb:     tmdbToInsert.length,
                    }
                };

                await this.pool.query(
                    `UPDATE Library SET log = ? WHERE id = ?`,
                    [JSON.stringify(result), libraryId]
                );
                return result;

            } catch(error) {
                await conn.rollback();
                throw error;
            } 
            finally {
                await this.unlockLibrary(libraryId, conn);
            }
        } catch (error: any) {
            const result: ReturnMessage = {
                id: -1, state: false, message: `${this.i18nService.t('common.ERROR')}: ${error?.message ?? error}`
            };
            await conn.query(
                `UPDATE Library SET log = ? WHERE id = ?`,
                [JSON.stringify(result), libraryId]
            );
            return result;
        } finally {
            await conn.release();
        }
    }

    private async lockMediaLibrary(mediaLibraryId: string, conn: mariadb.PoolConnection): Promise<any> {
        return await conn.query(`UPDATE Media_Library SET state = ? WHERE id = ?`, [StateLibrary.IN_PROGRESS, mediaLibraryId]);
    }
    private async unlockMediaLibrary(mediaLibraryId: string, conn: mariadb.PoolConnection): Promise<any> {
        return await conn.query(`UPDATE Media_Library SET state = ? WHERE id = ?`, [StateLibrary.NOT_WORKED, mediaLibraryId]);
    }

    public async modifyTmdbIdFromMediaLibrary(mediaLibraryId: string, tmdbId: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const mediaLibraries: MediaLibrary[] = await conn.query(`SELECT * FROM Media_Library WHERE id = ?`, [mediaLibraryId]);
            if (mediaLibraries.length > 0) {
                const mediaLibrary: MediaLibrary = mediaLibraries[0];
                const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [mediaLibrary.libraryId]);
                const library: Library = libraries[0];
                if (mediaLibrary.state === StateLibrary.NOT_WORKED && library.state === StateLibrary.NOT_WORKED) {
                    if (mediaLibrary.tmdbId != tmdbId) {
                        await this.lockMediaLibrary(mediaLibraryId, conn);
                        await conn.beginTransaction();
                        let messageTmdb!: ReturnMessage;
                        try {
                            if (library.mediaType === MediaType.MOVIE) {
                                messageTmdb = await this.modifyTmdbIdFromMovieLibrary(mediaLibrary, tmdbId, conn);
                            } else if (library.mediaType === MediaType.SERIES) {
                                messageTmdb = await this.modifyTmdbIdFromSeriesLibrary(mediaLibrary, tmdbId, conn);
                            }
                            await conn.commit();
                            return messageTmdb;
                        } catch(error) {
                            throw error;
                        } finally {
                            await this.unlockMediaLibrary(mediaLibraryId, conn);
                        }
                    } else {
                        return {
                            id: -1,
                            state: false,
                            message: this.i18nService.t("common.LIBRARY.NO_CHANGES")
                        }
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK")
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.LIBRARY.MEDIA_LIBRARY_UNFOUND")
                }
            }
        } catch(error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t('common.ERROR')}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }
    private async modifyTmdbIdFromMovieLibrary(mediaLibrary: MediaLibrary, tmdbId: number, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        await conn.query(`UPDATE Media_Library SET tmdbId = ? WHERE id = ?`, [tmdbId, mediaLibrary.id]);
        return {
            id: 0,
            state: true,
            message: this.i18nService.t("common.LIBRARY.TMDB_UPDATED")
        }
    }
    private async modifyTmdbIdFromSeriesLibrary(mediaLibrary: MediaLibrary, tmdbId: number, conn: mariadb.PoolConnection): Promise<ReturnMessage> {

        if (mediaLibrary.type !== MediaType.SERIES) {
            return {
                id:      -1,
                state:   false,
                message: this.i18nService.t("common.LIBRARY.ONLY_SERIES_CAN_MODIFIED")
            };
        }

        const childRows: { id: string }[] = await conn.query(
            `SELECT id FROM Media_Library
                WHERE parentId = ?
                    OR parentId IN (
                            SELECT id FROM Media_Library
                            WHERE parentId = ? AND type = 'SEASON'
                        )`,
                    [mediaLibrary.id, mediaLibrary.id]
            );
        const childIds: string[] = childRows.map((r) => r.id);
                
        await conn.query(
            `UPDATE Media_Library SET tmdbId = ? WHERE id = ?`,
            [tmdbId, mediaLibrary.id]
        );
                
        if (childIds.length > 0) {
            await conn.query(
                    `UPDATE Media_Library SET tmdbId = ?
                    WHERE id IN (${childIds.map(() => '?').join(',')})`,
                    [tmdbId, ...childIds]
                );
        }
                
        const updatedIds: string[] = [mediaLibrary.id, ...childIds];
    
        return {
            id: 0,
            state:   true,
            message: this.i18nService.t("common.LIBRARY.TMDB_UPDATED"),
            other: updatedIds
        };
    }

    public async reloadMediaLibraryMetadata(mediaLibraryId: string): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const mediaLibraries: MediaLibrary[] = await conn.query(`SELECT * FROM Media_Library WHERE id = ?`, [mediaLibraryId]);
            if (mediaLibraries.length > 0) {
                const mediaLibrary: MediaLibrary = mediaLibraries[0];
                const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [mediaLibrary.libraryId]);
                const library: Library = libraries[0];
                if (mediaLibrary.state === StateLibrary.NOT_WORKED && library.state === StateLibrary.NOT_WORKED) {
                    await this.lockMediaLibrary(mediaLibraryId, conn);
                    try {
                        if (library.mediaType === MediaType.MOVIE) {
                            return await this.reloadMovieLibraryMetadata(mediaLibrary, library, conn);
                        } else if (library.mediaType === MediaType.SERIES) {
                            return await this.reloadSeriesLibraryMetadata(mediaLibrary, library, conn);
                        }
                    } catch(error) {
                        throw error;
                    } finally {
                        await this.unlockMediaLibrary(mediaLibraryId, conn);
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK")
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.LIBRARY.MEDIA_LIBRARY_UNFOUND")
                }
            }
        } catch(error: any) {
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t('common.ERROR')}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }
    private async reloadMovieLibraryMetadata(mediaLibrary: MediaLibrary, library: Library, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        const existingMovies: Movie[] = await conn.query(`SELECT id FROM Media WHERE mediaLibraryId = ?`, [mediaLibrary.id]);
        const movieTmdb: EditMovie = await this.tmdbService.searchMovieByTmdbId(mediaLibrary.tmdbId, library.lang);
        let messageMovie!: ReturnMessage;
        movieTmdb.mediaLibraryId = mediaLibrary.id;
        if (existingMovies.length > 0) {
            movieTmdb.id = existingMovies[0].id;
            messageMovie = await this.movieService.updateMovie(movieTmdb);
        } else {
            messageMovie = await this.movieService.insertNewMovie(movieTmdb, true);
        }
        return messageMovie;
    }
    private async reloadSeriesLibraryMetadata(mediaLibrary: MediaLibrary, library: Library, conn: mariadb.PoolConnection): Promise<ReturnMessage> {
        const existingSeries: Media[] = await conn.query(
            `SELECT id FROM Media WHERE mediaLibraryId = ?`,
            [mediaLibrary.id]
        );
        const seriesTmdb: EditSeries = await this.tmdbService.searchSeriesByTmdbId(mediaLibrary.tmdbId, mediaLibrary.id, library.lang);
        let messageSeries: ReturnMessage;
        seriesTmdb.mediaLibraryId = mediaLibrary.id;
    
        if (existingSeries.length > 0) {
            seriesTmdb.id = existingSeries[0].id;
            messageSeries = await this.seriesService.updateSeries(seriesTmdb);
        } else {
            messageSeries = await this.seriesService.insertNewSeries(seriesTmdb, true);
        }
        return messageSeries;
    }

    public async reloadMediaLibraryFile(mediaLibraryId: string): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const mediaLibraries: MediaLibrary[] = await conn.query(`SELECT * FROM Media_Library WHERE id = ?`, [mediaLibraryId]);
            if (mediaLibraries.length > 0) {
                const mediaLibrary: MediaLibrary = mediaLibraries[0];
                const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [mediaLibrary.libraryId]);
                const library: Library = libraries[0];
                if (mediaLibrary.state === StateLibrary.NOT_WORKED && library.state === StateLibrary.NOT_WORKED) {
                    await this.lockMediaLibrary(mediaLibraryId, conn);
                    try {
                        if (library.mediaType === MediaType.MOVIE) {
                            return this.refreshLibraryMovies(library.id, mediaLibraryId);
                        } else if (library.mediaType === MediaType.SERIES) {
                            return this.refreshLibrarySeries(library.id, mediaLibraryId);
                        }
                    } catch(error) {
                        throw error;
                    } finally {
                        await this.unlockMediaLibrary(mediaLibraryId, conn);
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK")
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.LIBRARY.MEDIA_LIBRARY_UNFOUND")
                }
            }
        } catch(error: any) {
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t('common.ERROR')}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async deleteLibraryById(libraryId: string): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            const libraries: Library[] = await conn.query(`SELECT * FROM Library WHERE id = ?`, [libraryId]);

            if (libraries.length > 0) {
                
                const isUnlocked: boolean = await this.getIfLibraryIsUnlock(libraryId, conn);
                if (!isUnlocked) {
                    return { id: -1, state: false, message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK") };
                }

                await this.lockLibrary(libraryId, conn);
                
                try {
                    await conn.beginTransaction();
                    const messagesDeleted: any[] = [];
                    const medias: Media[] = await conn.query(`SELECT m.* FROM Media m
                        INNER JOIN Media_Library mlib ON mlib.libraryId = ?`, [libraryId]);

                    for(let media of medias) {
                        if (media.mediaType === MediaType.MOVIE) {
                            const message = await this.movieService.deleteMovieById(media.id);
                            messagesDeleted.push(message);
                        } else if (media.mediaType === MediaType.SERIES) {
                            const message = await this.seriesService.deleteSeriesById(media.id);
                            messagesDeleted.push(message);
                        }
                    }    

                    const resultMediaLibrary = await conn.query(`DELETE FROM Media_Library WHERE libraryId = ?`, [libraryId]);
                    const resultLibrary = await conn.query(`DELETE FROM Library WHERE id = ?`, [libraryId]);
                    const message: string = `${this.i18nService.t("common.LIBRARY.MEDIA_LIBRARY_DELETED")} (${resultMediaLibrary.affectedRows}) \n 
                                            ${this.i18nService.t("common.LIBRARY.LIBRARY_DELETED")} (${resultLibrary.affectedRows})`;
                    await conn.commit();

                    return {
                        id: 0,
                        state: true,
                        message: message,
                        other: messagesDeleted
                    }
                } catch(error) {
                    await conn.rollback();
                    await this.unlockLibrary(libraryId, conn);
                    throw error;
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.LIBRARY.LIBRARY_UNFOUND")
                }
            }
        } catch(error: any) {
            const messages = {
                id: -1,
                state: false,
                message: `${this.i18nService.t('common.ERROR')}: ${error.sqlMessage}`
            }
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

    public async refreshLibrarySeries(libraryId: string, mediaLibraryId: string | null): Promise<any> {
        const conn = await this.pool.getConnection();
        try {
            const libraries: Library[] = await conn.query(
                `SELECT * FROM Library WHERE id = ?`, [libraryId]
            );
            if (libraries.length === 0) {
                return { id: -1, state: false, message: this.i18nService.t("common.LIBRARY.LIBRARY_UNFOUND") };
            }
            const library = libraries[0];

            const isUnlocked: boolean = await this.getIfLibraryIsUnlock(libraryId, conn);
            if (!isUnlocked) {
                return { id: -1, state: false, message: this.i18nService.t("common.LIBRARY.LIBRARY_LOCK") };
            }

            await this.lockLibrary(libraryId, conn);

            try {
                await conn.beginTransaction();

                const rootPath: string = library.path;
                const lang: ISO_3166_1 = library.lang;

                // ── 1. Scan du disque ─────────────────────────────────────────
                // En mode ciblé : on appelle scanOneSeries() directement sur le
                // dossier de la série (targetFolderPath), ce qui évite de rescanner
                // tout rootPath et garantit que les sous-dossiers sont bien traités
                // comme des SAISONS et non comme des séries.
                // En mode global : scanSeriesDirectory() comme d'habitude.
                let scannedSeries: ScannedSeries[];

                if (mediaLibraryId) {
                    const targetML: MediaLibrary[] = await conn.query(
                        `SELECT path FROM Media_Library WHERE id = ? AND type = 'SERIES'`,
                        [mediaLibraryId]
                    );
                    if (targetML.length === 0) {
                        return { id: -1, state: false, message: this.i18nService.t("common.LIBRARY.MEDIA_LIBRARY_UNFOUND_OR_NOT_SERIES") };
                    }
                    const targetFolderPath = targetML[0].path;
                    // scanOneSeries attend (seriesDir, rootDir) — rootDir sert uniquement
                    // à vérifier si on est à la racine ; on passe le parent du dossier série.
                    const scanned = await this.seriesScannerService.scanOneSeries(
                        targetFolderPath, rootPath
                    );
                    scannedSeries = scanned ? [scanned] : [];
                } else {
                    scannedSeries = await this.seriesScannerService.scanSeriesDirectory(rootPath);
                }

                // ── 2. État actuel en base ────────────────────────────────────
                let existingML: MediaLibrary[];
                if (mediaLibraryId) {
                    existingML = await conn.query(
                        `SELECT id, path, type, tmdbId, parentId, seasonNumber, episodeNumber
                        FROM Media_Library
                        WHERE id = ?
                            OR parentId = ?
                            OR parentId IN (
                                SELECT id FROM Media_Library WHERE parentId = ? AND type = 'SEASON'
                            )`,
                        [mediaLibraryId, mediaLibraryId, mediaLibraryId]
                    );
                } else {
                    existingML = await conn.query(
                        `SELECT id, path, type, tmdbId, parentId, seasonNumber, episodeNumber
                        FROM Media_Library WHERE libraryId = ?`,
                        [libraryId]
                    );
                }

                const existingMLByPath = new Map<string, MediaLibrary>(
                    existingML.map((ml) => [this.normalizePath(ml.path), ml])
                );

                const seenPaths:   Set<string> = new Set();
                const logInserted: any[] = [];
                const logKept:     any[] = [];
                const logDeleted:  any[] = [];
                const logTmdb:     any[] = [];

                // ── 3. Parcours des séries scannées ───────────────────────────
                for (const series of scannedSeries) {

                    seenPaths.add(this.normalizePath(series.folderPath));

                    // ── 3a. SÉRIE ─────────────────────────────────────────────
                    const existingSeries = existingMLByPath.get(this.normalizePath(series.folderPath));
                    let seriesMLId: string;

                    if (existingSeries) {
                        seriesMLId = existingSeries.id;
                        logKept.push(`${this.i18nService.t("common.LIBRARY.SERIES")} ${series.seriesTitle} (${series.year}) — ${this.i18nService.t("common.LIBRARY.RETAINED")}`);
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
                            [seriesMLId, series.seriesTitle, series.year ?? 0,
                            series.folderPath, 0, libraryId]
                        );
                        logInserted.push(`${this.i18nService.t("common.LIBRARY.SERIES")} ${series.seriesTitle} (${series.year}) → ${seriesMLId}`);
                    }

                    // ── 3b. Recherche TMDB (uniquement si inconnu) ────────────
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
                            logTmdb.push(`${this.i18nService.t("common.LIBRARY.SERIES_TMDB")} ${series.seriesTitle} — ${this.i18nService.t("common.LIBRARY.ERROR")}: ${e}`);
                        }
                    }

                    // ── 3c. SAISONS ───────────────────────────────────────────
                    for (const season of series.seasons) {

                        seenPaths.add(this.normalizePath(season.folderPath));

                        const existingSeason = existingMLByPath.get(this.normalizePath(season.folderPath));
                        let seasonMLId: string;

                        if (existingSeason) {
                            seasonMLId = existingSeason.id;
                            logKept.push(`  [${this.i18nService.t("common.LIBRARY.SEASON")} ${season.seasonNumber}] ${this.i18nService.t("common.LIBRARY.RETAINED")}`);
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
                                [seasonMLId,
                                `${series.seriesTitle} — Saison ${season.seasonNumber}`,
                                series.year ?? 0, season.folderPath,
                                seriesTmdbId, libraryId,
                                seriesMLId, season.seasonNumber]
                            );
                            logInserted.push(
                                `  [${this.i18nService.t("common.LIBRARY.SEASON")} ${season.seasonNumber}] ${season.folderPath} → ${seasonMLId} (${this.i18nService.t("common.LIBRARY.PARENT")}: ${seriesMLId})`
                            );
                        }

                        // ── 3d. ÉPISODES ──────────────────────────────────────
                        for (const episode of season.episodes) {

                            seenPaths.add(this.normalizePath(episode.filePath));

                            const existingEpisode = existingMLByPath.get(this.normalizePath(episode.filePath));
                            if (existingEpisode) {
                                logKept.push(`    [${this.i18nService.t("common.LIBRARY.EP")} ${episode.episodeNumber}] ${episode.filePath} — ${this.i18nService.t("common.LIBRARY.RETAINED")}`);
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
                                    [episodeMLId,
                                    `${series.seriesTitle} S${String(season.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`,
                                    series.year ?? 0, episode.filePath,
                                    seriesTmdbId, libraryId,
                                    seasonMLId, season.seasonNumber, episode.episodeNumber,
                                    metadata.duration  ?? 0n,
                                    metadata.frames    ?? 0n,
                                    metadata.bytes     ?? 0n,
                                    metadata.width     ?? 0,
                                    metadata.height    ?? 0,
                                    metadata.resolution ?? 'SD']
                                );
                                logInserted.push(
                                    `    [${this.i18nService.t("common.LIBRARY.EP")} ${episode.episodeNumber}] ${episode.filePath} → ${episodeMLId} (${this.i18nService.t("common.LIBRARY.PARENT")}: ${seasonMLId}, ${metadata.duration}ms, ${metadata.resolution})`
                                );
                            } catch (e) {
                                logInserted.push(
                                    `    [${this.i18nService.t("common.LIBRARY.EP")} ${episode.episodeNumber}] ${episode.filePath} — ${this.i18nService.t("common.LIBRARY.ERROR_METADAT")}: ${e}`
                                );
                            }
                        }
                    }
                }

                // ── 4. Suppressions ───────────────────────────────────────────
                const toDelete = existingML.filter(
                    (ml) => !seenPaths.has(this.normalizePath(ml.path))
                );

                if (toDelete.length > 0) {
                    const toDeleteByType = {
                        series:   toDelete.filter((ml) => ml.type === MediaType.SERIES),
                        seasons:  toDelete.filter((ml) => ml.type === MediaType.SEASON),
                        episodes: toDelete.filter((ml) => ml.type === MediaType.EPISODE),
                    };

                    for (const ml of toDeleteByType.series) {
                        const medias: Media[] = await conn.query(
                            `SELECT id FROM Media WHERE mediaLibraryId = ? AND mediaType = ?`,
                            [ml.id, MediaType.SERIES]
                        );
                        for (const media of medias) {
                            const msg = await this.seriesService.deleteSeriesById(media.id);
                            logDeleted.push(`${this.i18nService.t("common.LIBRARY.DEL_SERIES")} mediaId=${media.id} → ${msg.message}`);
                        }
                        logDeleted.push(`${this.i18nService.t("common.LIBRARY.DEL_ML_SERIES")} ${ml.path}`);
                    }

                    if (toDeleteByType.seasons.length > 0) {
                        const seasonMLIds = toDeleteByType.seasons.map((ml) => ml.id);
                        const seasonsToDelete: Season[] = await conn.query(
                            `SELECT s.id, s.seriesId, s.name, s.seasonNumber, p.name as srcPoster, s.mediaLibraryId
                            FROM Season s
                            LEFT JOIN Poster p ON p.id = s.srcPoster
                            WHERE s.mediaLibraryId IN (${seasonMLIds.map(() => '?').join(',')})`,
                            seasonMLIds
                        );
                        if (seasonsToDelete.length > 0) {
                            const seriesIdGroups = new Map<number, Season[]>();
                            for (const s of seasonsToDelete) {
                                if (!seriesIdGroups.has(s.seriesId)) seriesIdGroups.set(s.seriesId, []);
                                seriesIdGroups.get(s.seriesId)!.push(s);
                            }
                            for (const [seriesId, seasons] of seriesIdGroups) {
                                const msg = await this.seriesService.deleteManySeasons(seasons, seriesId.toString(), conn);
                                logDeleted.push(`${this.i18nService.t("common.LIBRARY.DEL_SEASONS")} seriesId=${seriesId} → ${msg}`);
                            }
                        }
                        logDeleted.push(...toDeleteByType.seasons.map((ml) => `${this.i18nService.t("common.LIBRARY.DEL_ML_SEASON")} ${ml.path}`));
                    }

                    if (toDeleteByType.episodes.length > 0) {
                        const episodeMLIds = toDeleteByType.episodes.map((ml) => ml.id);
                        const episodesToDelete: Episode[] = await conn.query(
                            `SELECT e.id, e.seriesId, e.seasonId, p.name as srcPoster, e.mediaLibraryId
                            FROM Episode e
                            LEFT JOIN Poster p ON p.id = e.srcPoster
                            WHERE e.mediaLibraryId IN (${episodeMLIds.map(() => '?').join(',')})`,
                            episodeMLIds
                        );
                        if (episodesToDelete.length > 0) {
                            const seriesIdGroups = new Map<number, Episode[]>();
                            for (const e of episodesToDelete) {
                                if (!seriesIdGroups.has(e.seriesId)) seriesIdGroups.set(e.seriesId, []);
                                seriesIdGroups.get(e.seriesId)!.push(e);
                            }
                            for (const [seriesId, episodes] of seriesIdGroups) {
                                const msg = await this.seriesService.deleteManyEpisodes(episodes, seriesId.toString(), conn);
                                logDeleted.push(`${this.i18nService.t("common.LIBRARY.DEL_EPISODES")} seriesId=${seriesId} → ${msg}`);
                            }
                        }
                        logDeleted.push(...toDeleteByType.episodes.map((ml) => `${this.i18nService.t("common.LIBRARY.DEL_ML_EPISODE")} ${ml.path}`));
                    }

                    const toDeleteIds = toDelete.map((ml) => ml.id);
                    await conn.query(
                        `DELETE FROM Media_Library WHERE id IN (${toDeleteIds.map(() => '?').join(',')})`,
                        toDeleteIds
                    );
                }

                await conn.commit();

                // ── 5. Phase TMDB hors transaction ────────────────────────────
                await conn.release();

                const tmdbWhereClause5a = mediaLibraryId ? `AND ml.id = '${mediaLibraryId}'`         : '';
                const tmdbWhereClause5b = mediaLibraryId ? `AND ml_series.id = '${mediaLibraryId}'`  : '';

                // 5a. Nouvelles séries sans Media → insertNewSeries complet
                const seriesWithoutMedia: MediaLibrary[] = await this.pool.query(
                    `SELECT ml.id, ml.tmdbId FROM Media_Library ml
                    WHERE ml.libraryId = ? AND ml.type = 'SERIES'
                    AND ml.tmdbId > 0
                    ${tmdbWhereClause5a}
                    AND NOT EXISTS (SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml.id)`,
                    [libraryId]
                );

                for (const ml of seriesWithoutMedia) {
                    try {
                        const editSeries = await this.tmdbService.searchSeriesByTmdbId(ml.tmdbId, ml.id, lang);
                        editSeries.mediaLibraryId = ml.id;
                        const msg = await this.seriesService.insertNewSeries(editSeries, true);
                        logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_INSERT")} tmdbId=${ml.tmdbId} → ${msg.message}`);
                    } catch (e) {
                        logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_INSERT_ERROR")} tmdbId=${ml.tmdbId} — erreur: ${e}`);
                    }
                }

                // 5b. Séries existantes avec de nouveaux contenus → insertion ciblée
                const seriesWithNewContent: MediaLibrary[] = await this.pool.query(
                    `SELECT DISTINCT ml_series.id, ml_series.tmdbId
                    FROM Media_Library ml_series
                    WHERE ml_series.libraryId = ?
                    AND ml_series.type = 'SERIES'
                    AND ml_series.tmdbId > 0
                    ${tmdbWhereClause5b}
                    AND EXISTS (SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml_series.id)
                    AND (
                        EXISTS (
                            SELECT 1 FROM Media_Library ml_s
                            WHERE ml_s.parentId = ml_series.id AND ml_s.type = 'SEASON'
                                AND NOT EXISTS (SELECT 1 FROM Season s WHERE s.mediaLibraryId = ml_s.id)
                        )
                        OR EXISTS (
                            SELECT 1 FROM Media_Library ml_e
                            WHERE ml_e.type = 'EPISODE'
                                AND ml_e.parentId IN (
                                    SELECT id FROM Media_Library WHERE parentId = ml_series.id AND type = 'SEASON'
                                )
                                AND NOT EXISTS (SELECT 1 FROM Episode e WHERE e.mediaLibraryId = ml_e.id)
                        )
                    )`,
                    [libraryId]
                );

                for (const ml of seriesWithNewContent) {
                    try {
                        const existingMediaRows: { id: number }[] = await this.pool.query(
                            `SELECT id FROM Media WHERE mediaLibraryId = ? AND mediaType = ?`,
                            [ml.id, MediaType.SERIES]
                        );
                        if (existingMediaRows.length === 0) continue;

                        const seriesMediaId = existingMediaRows[0].id;
                        const formatedTitle = seriesMediaId.toString();
                        const editSeries = await this.tmdbService.searchSeriesByTmdbId(ml.tmdbId, ml.id, lang);

                        const conn2 = await this.pool.getConnection();
                        try {
                            await conn2.beginTransaction();

                            const newSeasonMLRows: { id: string; seasonNumber: number }[] = await conn2.query(
                                `SELECT ml_s.id, ml_s.seasonNumber
                                FROM Media_Library ml_s
                                WHERE ml_s.parentId = ? AND ml_s.type = 'SEASON'
                                AND NOT EXISTS (SELECT 1 FROM Season s WHERE s.mediaLibraryId = ml_s.id)`,
                                [ml.id]
                            );

                            if (newSeasonMLRows.length > 0) {
                                const newEditSeasons: EditSeason[] = newSeasonMLRows.map((row) => {
                                    const tmdbSeason = editSeries.seasons.find((s) => s.seasonNumber === row.seasonNumber);
                                    return {
                                        id:             tmdbSeason?.id       ?? 0,
                                        seriesId:       seriesMediaId,
                                        mediaLibraryId: row.id,
                                        name:           tmdbSeason?.name     ?? `Saison ${row.seasonNumber}`,
                                        seasonNumber:   row.seasonNumber,
                                        srcPoster:      tmdbSeason?.srcPoster ?? null,
                                        episodes:       [],
                                    };
                                });
                                const msg = await this.seriesService.insertManySeasons(
                                    newEditSeasons, seriesMediaId, formatedTitle, conn2
                                );
                                logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_NEW_SEASONS")} tmdbId=${ml.tmdbId} → ${msg}`);
                            }

                            const newEpisodeMLRows: {
                                mlId: string; seasonNumber: number;
                                episodeNumber: number; seasonDbId: number;
                            }[] = await conn2.query(
                                `SELECT ml_e.id AS mlId, ml_e.seasonNumber, ml_e.episodeNumber, s.id AS seasonDbId
                                FROM Media_Library ml_e
                                INNER JOIN Media_Library ml_s ON ml_s.id = ml_e.parentId AND ml_s.type = 'SEASON'
                                INNER JOIN Season s ON s.mediaLibraryId = ml_s.id
                                WHERE ml_s.parentId = ? AND ml_e.type = 'EPISODE'
                                AND NOT EXISTS (SELECT 1 FROM Episode e WHERE e.mediaLibraryId = ml_e.id)`,
                                [ml.id]
                            );

                            if (newEpisodeMLRows.length > 0) {
                                const bySeasonId = new Map<number, typeof newEpisodeMLRows>();
                                for (const row of newEpisodeMLRows) {
                                    if (!bySeasonId.has(row.seasonDbId)) bySeasonId.set(row.seasonDbId, []);
                                    bySeasonId.get(row.seasonDbId)!.push(row);
                                }
                                for (const [seasonDbId, rows] of bySeasonId) {
                                    const newEditEpisodes: EditEpisode[] = rows.map((row) => {
                                        const tmdbSeason  = editSeries.seasons.find((s) => s.seasonNumber === row.seasonNumber);
                                        const tmdbEpisode = tmdbSeason?.episodes.find((e) => e.episodeNumber === row.episodeNumber);
                                        return {
                                            id:             tmdbEpisode?.id          ?? 0,
                                            seasonId:       seasonDbId,
                                            mediaLibraryId: row.mlId,
                                            name:           tmdbEpisode?.name        ?? `${this.i18nService.t("common.LIBRARY.EPISODE")} ${row.episodeNumber}`,
                                            episodeNumber:  row.episodeNumber,
                                            srcPoster:      tmdbEpisode?.srcPoster   ?? null,
                                            description:    tmdbEpisode?.description ?? undefined,
                                            date:           tmdbEpisode?.date        ?? undefined,
                                            path:           undefined,
                                        };
                                    });
                                    const msg = await this.seriesService.insertManyEpisodes(
                                        newEditEpisodes, seriesMediaId, seasonDbId, formatedTitle, conn2
                                    );
                                    logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_NEW_EPISODES")} seasonId=${seasonDbId} → ${msg}`);
                                }
                            }

                            await conn2.commit();
                        } catch (e) {
                            await conn2.rollback();
                            logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_NEW_CONTENT_ERROR")} tmdbId=${ml.tmdbId} — erreur: ${e}`);
                        } finally {
                            await conn2.release();
                        }

                    } catch (e) {
                        logTmdb.push(`${this.i18nService.t("common.LIBRARY.TMDB_NEW_CONTENT_ERROR")} tmdbId=${ml.tmdbId} — erreur: ${e}`);
                    }
                }

                const result = {
                    state:    true,
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

            } catch (error) {
                await conn.rollback();
                throw error;
            } finally {
                await this.unlockLibrary(libraryId, conn);
            }

        } catch (error: any) {
            const result: ReturnMessage = {
                id: -1, state: false, message: `${this.i18nService.t('common.ERROR')}: ${error?.message ?? error}`
            };
            await conn.query(
                `UPDATE Library SET log = ? WHERE id = ?`,
                [JSON.stringify(result), libraryId]
            );
            return result;
        } finally {
            await conn.release();
        }
    }

    public async getSeriesMediaLibraryMaps(seriesMediaLibraryId: string): Promise<{
        seriesML:              MediaLibrary | null;
        seasonByNumber:        Map<number, MediaLibrary>;
        episodeBySeasonAndNum: Map<string,  MediaLibrary[]>;  // tableau pour gérer les doublons episodeNumber=0
    }> {
        const conn = await this.pool.getConnection();
        try {
            const rows: MediaLibrary[] = await conn.query(
                `SELECT id, type, parentId, seasonNumber, episodeNumber, path, titleFormated
                FROM Media_Library
                WHERE id = ?
                    OR parentId = ?
                    OR parentId IN (
                        SELECT id FROM Media_Library
                        WHERE parentId = ? AND type = 'SEASON'
                    )`,
                [seriesMediaLibraryId, seriesMediaLibraryId, seriesMediaLibraryId]
            );
    
            let seriesML: MediaLibrary | null = null;
            const seasonByNumber        = new Map<number, MediaLibrary>();
            const episodeBySeasonAndNum = new Map<string,  MediaLibrary[]>();
    
            for (const row of rows) {
                if (row.type === MediaType.SERIES) {
                    seriesML = row;
                } else if (row.type === MediaType.SEASON && row.seasonNumber != null) {
                    seasonByNumber.set(row.seasonNumber, row);
                } else if (row.type === MediaType.EPISODE && row.seasonNumber != null && row.episodeNumber != null) {
                    // Clé "seasonNumber_episodeNumber" — plusieurs épisodes peuvent
                    // partager la même clé quand episodeNumber = 0 (bonus non reconnus).
                    // On stocke dans un tableau pour ne perdre aucun épisode.
                    const key = `${row.seasonNumber}_${row.episodeNumber}`;
                    if (!episodeBySeasonAndNum.has(key)) {
                        episodeBySeasonAndNum.set(key, []);
                    }
                    episodeBySeasonAndNum.get(key)!.push(row);
                }
            }
    
            return { seriesML, seasonByNumber, episodeBySeasonAndNum };
        } catch {
            return {
                seriesML:              null,
                seasonByNumber:        new Map(),
                episodeBySeasonAndNum: new Map(),
            };
        } finally {
            await conn.release();
        }
    }
 
    // ─────────────────────────────────────────────────────────────────────────────
    // Fonction 1 : Médias dont le fichier source n'existe plus sur le disque
    //
    // Retourne :
    //   - Les Media de type MOVIE dont le chemin (via Media_Library) n'existe plus
    //   - Les Episode dont le chemin (via Media_Library) n'existe plus
    // ─────────────────────────────────────────────────────────────────────────────

    public async getMediaWithMissingFiles(): Promise<{
        movies:   { id: number;  name: string; path: string; mediaLibraryId: string }[];
        episodes: { id: number; name: string;  path: string; mediaLibraryId: string; seriesId: number; seasonId: number }[];
    }> {
        const conn = await this.pool.getConnection();
        try {
            // Films dont le chemin Media_Library n'existe plus sur le disque
            const movieRows: {
                id:        number;
                name:          string;
                path:           string;
                mediaLibraryId: string;
            }[] = await conn.query(
                `SELECT m.id, m.title as name, ml.path, ml.id AS mediaLibraryId
                FROM Media m
                INNER JOIN Media_Library ml ON ml.id = m.mediaLibraryId
                WHERE m.mediaType = 'MOVIE'`
            );

            // Épisodes dont le chemin Media_Library n'existe plus sur le disque
            const episodeRows: {
                id:      number;
                name:           string;
                path:           string;
                mediaLibraryId: string;
                seriesId:       number;
                seasonId:       number;
            }[] = await conn.query(
                `SELECT e.id, e.name, ml.path, ml.id AS mediaLibraryId,
                        e.seriesId, e.seasonId
                FROM Episode e
                INNER JOIN Media_Library ml ON ml.id = e.mediaLibraryId`
            );

            // Vérification de l'existence sur le disque (en parallèle par batch)
            const checkExists = async (filePath: string): Promise<boolean> => {
                try {
                    await fs.access(filePath);
                    return true;
                } catch {
                    return false;
                }
            };

            const [movieExistsResults, episodeExistsResults] = await Promise.all([
                Promise.all(movieRows.map((r) => checkExists(r.path))),
                Promise.all(episodeRows.map((r) => checkExists(r.path))),
            ]);

            const missingMovies   = movieRows.filter((_, i) => !movieExistsResults[i]);
            const missingEpisodes = episodeRows.filter((_, i) => !episodeExistsResults[i]);

            return {
                movies:   missingMovies,
                episodes: missingEpisodes,
            };
        } finally {
            await conn.release();
        }
    }

    public async getOrphanMediaLibraries(): Promise<{
        movies:   OrphanMediaLibrary[];
        series:   OrphanMediaLibrary[];
        seasons:  OrphanMediaLibrary[];
        episodes: OrphanMediaLibrary[];
    }> {
        const conn = await this.pool.getConnection();
        try {
            const rows: OrphanMediaLibrary[] = await conn.query(
                `SELECT ml.id, ml.titleFormated, ml.type, ml.path, ml.tmdbId, ml.libraryId,
                        ml.parentId, ml.titleFormated
                FROM Media_Library ml
                WHERE
                    (ml.type = 'MOVIE'
                        AND NOT EXISTS (
                            SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml.id
                        )
                    )
                    OR
                    (ml.type = 'SERIES'
                        AND NOT EXISTS (
                            SELECT 1 FROM Media m WHERE m.mediaLibraryId = ml.id
                        )
                    )
                    OR
                    (ml.type = 'SEASON'
                        AND NOT EXISTS (
                            SELECT 1 FROM Season s WHERE s.mediaLibraryId = ml.id
                        )
                        AND EXISTS (
                            SELECT 1 FROM Media_Library p
                            INNER JOIN Media m ON m.mediaLibraryId = p.id
                            WHERE p.id = ml.parentId
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM Media_Library ep
                            INNER JOIN Episode e ON e.mediaLibraryId = ep.id
                            WHERE ep.parentId = ml.id AND ep.type = 'EPISODE'
                        )
                    )
                    OR
                    (ml.type = 'EPISODE'
                        AND NOT EXISTS (
                            SELECT 1 FROM Episode e WHERE e.mediaLibraryId = ml.id
                        )
                        AND EXISTS (
                            SELECT 1 FROM Media_Library p
                            INNER JOIN Season s ON s.mediaLibraryId = p.id
                            WHERE p.id = ml.parentId
                        )
                    )
                ORDER BY ml.type, ml.libraryId, ml.path`
            );
    
            return {
                movies:   rows.filter((r) => r.type === MediaType.MOVIE),
                series:   rows.filter((r) => r.type === MediaType.SERIES),
                seasons:  rows.filter((r) => r.type === MediaType.SEASON),
                episodes: rows.filter((r) => r.type === MediaType.EPISODE),
            };
        } finally {
            await conn.release();
        }
    }

    public async getDuplicateTmdbIdGraph(): Promise<{
        nodes: { movies: Node[]; series: Node[] };
        links: { movies: Link[]; series: Link[] };
    }> {
        const conn = await this.pool.getConnection();
        try {
            const duplicateRows: {
                tmdbId:        number;
                type:          string;
                id:            string;
                titleFormated: string;
                path:          string;
                libraryId:     string;
            }[] = await conn.query(
                `SELECT ml.tmdbId, ml.type, ml.id, ml.titleFormated, ml.path, ml.libraryId
                FROM Media_Library ml
                WHERE ml.tmdbId > 0
                AND ml.type IN ('MOVIE', 'SERIES')
                AND (ml.tmdbId, ml.type, ml.libraryId) IN (
                    SELECT tmdbId, type, libraryId
                    FROM Media_Library
                    WHERE tmdbId > 0
                        AND type IN ('MOVIE', 'SERIES')
                    GROUP BY tmdbId, type, libraryId
                    HAVING COUNT(*) > 1
                )
                ORDER BY ml.type, ml.tmdbId, ml.id`
            );
    
            if (duplicateRows.length === 0) {
                return {
                    nodes: { movies: [], series: [] },
                    links: { movies: [], series: [] },
                };
            }
    
            const movieNodes: Node[] = [];
            const seriesNodes: Node[] = [];
            const movieLinks: Link[] = [];
            const seriesLinks: Link[] = [];
    
            // tmdbId déjà ajouté comme nœud central (par type)
            const tmdbNodeSet = new Set<string>();
    
            for (const row of duplicateRows) {
                const isMovie    = row.type === MediaType.MOVIE;
                const tmdbKey    = `${row.tmdbId}_${row.type}`;
                const nodeList   = isMovie ? movieNodes  : seriesNodes;
                const linkList   = isMovie ? movieLinks  : seriesLinks;
    
                // Nœud central tmdbId — id = tmdbId (number)
                if (!tmdbNodeSet.has(tmdbKey)) {
                    tmdbNodeSet.add(tmdbKey);
                    nodeList.push({
                        id:   row.tmdbId,
                        name: `tmdbId: ${row.tmdbId}`,
                    });
                }
    
                nodeList.push({
                    id:   row.tmdbId * 1000 + nodeList.length, // id unique par nœud ML
                    name: `${row.titleFormated} [${row.id}] — ${row.path}`,
                });
    
                // Link : source = tmdbId, target = id du nœud ML qu'on vient de créer
                linkList.push({
                    source:     row.tmdbId,
                    target:     nodeList[nodeList.length - 1].id,
                    targetType: row.type as MediaType,
                });
            }
    
            return {
                nodes: { movies: movieNodes, series: seriesNodes },
                links: { movies: movieLinks, series: seriesLinks },
            };
        } finally {
            await conn.release();
        }
    }
 
}
