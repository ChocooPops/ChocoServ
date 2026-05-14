import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { lastValueFrom } from "rxjs";
import { SelectionType } from "src/selection/dto/selection-type.enum";
import { TranslationTitle } from "src/media/dto/translation-title.interface";
import { ISO_3166_1 } from "src/media/dto/iso-3166-1.enum";
import { HttpService } from '@nestjs/axios';
import fetch from 'node-fetch';
import { EditMovie } from "src/movie/dto/edit-movie.interface";
import { CategorySimple } from "src/category/dto/categorySimple.interface";
import { EditPoster } from "src/media/dto/edit-poster.interface";
import { EditEpisode } from "src/series/dto/edit-episode.interface";
import { EditSeason } from "src/series/dto/edit-season.interface";
import { EditSeries } from "src/series/dto/edit-series.interface";
import { MediaType } from "src/media/dto/media-type.enum";
import { CategoryService } from "src/category/service/category.service";
import { ConfigService } from "@nestjs/config";
import { MediaCredit } from "src/credit/dto/media-credit.interface";
import { Job } from "src/credit/dto/job.enum";
import { Movie } from "src/movie/dto/movie.interface";
import { Series } from "src/series/dto/series.interface";
import { Credit } from "src/credit/dto/credit.interface";
import { LibraryService } from "src/library/service/library.service";
import { CategoryTmdb } from "src/category/dto/category-tmbd.interface";
import { MediaLibrary } from "src/library/dto/media-library.interface";

@Injectable()
export class TmdbService {

    constructor(private readonly httpService: HttpService,
        private readonly categoryService: CategoryService,
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => LibraryService))
        private readonly libraryService: LibraryService
    ) { }

    private readonly apiKeyTMDB: string = `api_key=${this.configService.get<string>('TMDB_API_KEY')}`;
    private readonly baseUrlTmdb: string = this.configService.get<string>('TMDB_BASE_URL');

    private readonly TMDB_LANGUAGES: Record<ISO_3166_1, string> = {
        [ISO_3166_1.VO]: 'en-US',
        [ISO_3166_1.US]: 'en-US',
        [ISO_3166_1.GB]: 'en-GB',
        [ISO_3166_1.FR]: 'fr-FR',
        [ISO_3166_1.ES]: 'es-ES',
        [ISO_3166_1.DE]: 'de-DE',
        [ISO_3166_1.IT]: 'it-IT',
        [ISO_3166_1.JP]: 'ja-JP',
        [ISO_3166_1.RU]: 'ru-RU',
        [ISO_3166_1.KR]: 'ko-KR',
        [ISO_3166_1.CN]: 'zh-CN',
        [ISO_3166_1.PT]: 'pt-PT',
    };

    private readonly apiTMDBSearchMovie: string = `${this.baseUrlTmdb}/search/movie`;
    private readonly apiTMDBMovie: string = `${this.baseUrlTmdb}/movie`;

    private readonly apiTMDBTv: string = `${this.baseUrlTmdb}/tv`;
    private readonly apiTMDBSearchTv: string = `${this.baseUrlTmdb}/search/tv`;

    private readonly apiTMDBPerson: string = `${this.baseUrlTmdb}/person`;
    private readonly apiTMDBSearchPerson: string = `${this.baseUrlTmdb}/search/person`;

    private readonly apiTMDBGenreMovie: string = `${this.baseUrlTmdb}/genre/movie/list`;
    private readonly apiTMDBGenreSeries: string = `${this.baseUrlTmdb}/genre/tv/list`;

    private getParamLanguage(lang: ISO_3166_1 | null): string {
        if (lang) {
            const language = this.TMDB_LANGUAGES[lang] || 'en-US';
            return `language=${language}`;
        } else {
            return '';
        }
    }

    // ==============================================
    // FONCTION USED INTO MOVIE MODULE
    // ==============================================
    public async getTmdbIdForMovieByTitleAndYear(title: string, year: number): Promise<number | null> {
        try {
            const paramYear = year && /^\d+$/.test(year?.toString()) && year > 1900 ? `&primary_release_year=${year}`: '';
            const param: string = `&query=${title}${paramYear}`;
            const url: string = `${this.apiTMDBSearchMovie}?${this.apiKeyTMDB}${param}`;
            const response = await lastValueFrom(this.httpService.get(url));
            const id: number = Number(response.data.results[0].id);
            return id;
        } catch(error) {
            return null
        }
    }
    public async searchMoviebByTitle(title: string): Promise<EditMovie> {
        const param: string = `&query=${title}`;
        const url: string = `${this.apiTMDBSearchMovie}?${this.apiKeyTMDB}${param}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const id: number = Number(response.data.results[0].id);
        return await this.searchMovieByTmdbId(id, null);
    }

    public async searchMovieByMediaLibraryId(mediaLibraryId: string): Promise<EditMovie> {
        const tmdbId: number | null = await this.libraryService.getTmdbIdByMediaLibrary(mediaLibraryId);
        if (tmdbId) {
            return await this.searchMovieByTmdbId(tmdbId, null);
        } else {
            return null;
        }
    }
    public async searchMovieByTmdbId(id: number, lang: ISO_3166_1 | null): Promise<EditMovie> {
        const mediaLibraryId: string | null = await this.libraryService.getMediaLibraryIdByTmdbId(id);
        if (!lang) {
            lang = await this.libraryService.getLanguageByMediaLibraryTmdbId(id);
        }
        const paramLanguage = this.getParamLanguage(lang);

        const url: string = `${this.apiTMDBMovie}/${id}?${this.apiKeyTMDB}&append_to_response=credits,translations,keywords&${paramLanguage}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const categories: CategorySimple[] = await this.getCategories(response.data.genres);
        const credits: MediaCredit[] = this.getCreditsForMovie(response.data.credits);
        const keywords: string[] = this.getKeyWords(response.data.keywords.keywords);
        const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(response.data.translations.translations, MediaType.MOVIE, response.data.original_title);

        let images: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] };
        try {
            const urlPoster: string = `${this.apiTMDBMovie}/${id}/images?${this.apiKeyTMDB}`;
            const responsePoster = await lastValueFrom(this.httpService.get(urlPoster));
            images = await this.getImageByTmdbId(responsePoster, 1, lang);
        } catch (error) {
            images = {
                back: null,
                logo: null,
                posterVertical: [],
                posterHorizontal: []
            }
        }

        const movie: EditMovie = {
            id: response.data.id,
            title: response.data.title || response.data.original_title,
            mediaLibraryId: mediaLibraryId,
            otherTitles: otherLanguage,
            description: response.data.overview,
            startShow: '00:00:00',
            endShow: '00:00:00',
            credits: credits,
            categories: categories,
            keyWords: keywords,
            date: response.data.release_date,
            posters: images.posterVertical,
            horizontalPoster: images.posterHorizontal,
            horizontalPosterSameAsBackground: false,
            logo: images.logo,
            backgroundImage: images.back,
        }
        return movie;
    }

    // ==============================================
    // FONCTION USED INTO SERIES MODULE
    // ==============================================
    public async getTmdbIdForSeriesByTitleAndYear(title: string, year: number): Promise<number | null> {
        try {
            const paramYear = year && /^\d+$/.test(year?.toString()) && year > 1900 ? `&primary_release_year=${year}`: '';
            const param: string = `&query=${title}${paramYear}`;
            const url: string = `${this.apiTMDBSearchTv}?${this.apiKeyTMDB}${param}`;
            const response = await lastValueFrom(this.httpService.get(url));
            const id: number = Number(response.data.results[0].id);
            return id;
        } catch(error) {
            return null
        }
    }
    public async searchSeriesByTitle(title: string): Promise<any> {
        const param: string = `&query=${title}`;
        const url: string = `${this.apiTMDBSearchTv}?${this.apiKeyTMDB}${param}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const id: number = Number(response.data.results[0].id);
        return await this.searchSeriesByTmdbId(id, null, null);
    }

    public async searchSeriesByMediaLibraryId(mediaLibraryId: string): Promise<EditMovie> {
        const tmdbId: number | null = await this.libraryService.getTmdbIdByMediaLibrary(mediaLibraryId);
        if (tmdbId) {
            return await this.searchSeriesByTmdbId(tmdbId, mediaLibraryId, null);
        } else {
            return null;
        }
    }

    public async searchSeriesByTmdbId(id: number, mediaLibraryId: string | null, lang: ISO_3166_1): Promise<EditSeries> {
        if (!lang) {
            lang = await this.libraryService.getLanguageByMediaLibraryTmdbId(id);
        }
        if (!mediaLibraryId) {
            mediaLibraryId = await this.libraryService.getMediaLibraryIdByTmdbId(id);
        }
        const paramLanguage = this.getParamLanguage(lang);

        const url: string = `${this.apiTMDBTv}/${id}?${this.apiKeyTMDB}&append_to_response=aggregate_credits,translations,keywords&${paramLanguage}`;
        const response = await lastValueFrom(this.httpService.get(url));

        const categories: CategorySimple[]      = await this.getCategories(response.data.genres);
        let credits:    MediaCredit[]         = this.getCreditsForSeries(response.data.aggregate_credits, response.data.created_by);
        const keywords:   string[]              = this.getKeyWords(response.data.keywords.results);
        const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(
            response.data.translations.translations, MediaType.SERIES, response.data.original_name
        );

        let images: { back: string; logo: string; posterVertical: EditPoster[]; posterHorizontal: EditPoster[] };
        try {
            const urlPoster = `${this.apiTMDBTv}/${id}/images?${this.apiKeyTMDB}`;
            const responsePoster = await lastValueFrom(this.httpService.get(urlPoster));
            images = await this.getImageByTmdbId(responsePoster, 1, lang);
        } catch {
            images = { back: null, logo: null, posterVertical: [], posterHorizontal: [] };
        }

        const { seriesML, seasonByNumber, episodeBySeasonAndNum } =
            await this.libraryService.getSeriesMediaLibraryMaps(mediaLibraryId);

        const seasons: EditSeason[] = await this.getAllSeasonsBySeries(
            id,
            response.data.seasons,
            paramLanguage,
            seasonByNumber,
            episodeBySeasonAndNum,
        );

        return {
            id,
            title:                           response.data.name,
            mediaLibraryId:                  seriesML?.id ?? null,
            otherTitles:                     otherLanguage,
            categories,
            keyWords:                        keywords,
            description:                     response.data.overview,
            credits,
            date:                            response.data.first_air_date,
            startShow:                       '00:00:00',
            endShow:                         '00:00:00',
            posters:                         images.posterVertical,
            logo:                            images.logo,
            backgroundImage:                 images.back,
            seasons,
            horizontalPoster:                images.posterHorizontal,
            horizontalPosterSameAsBackground: false,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────

    private async getAllSeasonsBySeries(
        seriesTmdbId:          number,
        seasonsTmdb:           any[],
        paramLanguage:         string,
        seasonByNumber:        Map<number, MediaLibrary>,
        episodeBySeasonAndNum: Map<string, MediaLibrary[]>,
    ): Promise<EditSeason[]> {

        // ── Types locaux ──────────────────────────────────────────────────────

        interface TmdbEpisodeMeta {
            episodeTmdbId: number;
            seasonTmdbId:  number;
            seasonNumber:  number;
            episodeNumber: number;
            name:          string;
            overview:      string;
            air_date:      string;
            still_path:    string | null;
        }

        interface DbEpisodeEntry {
            seasonNumber:  number;
            episodeNumber: number;
            ml:            MediaLibrary;
            seasonML:      MediaLibrary;
        }

        // ── Saisons TMDB > 0, triées ──────────────────────────────────────────
        const seasonsTmdbSorted = [...seasonsTmdb]
            .filter((s) => s.season_number > 0)
            .sort((a, b) => a.season_number - b.season_number);

        // Numéros de saisons BDD > 0
        const dbSeasonNums = [...seasonByNumber.keys()]
            .filter((n) => n > 0)
            .sort((a, b) => a - b);

        // ── Détection du mode ─────────────────────────────────────────────────
        // On compare les ensembles de numéros de saisons BDD et TMDB.
        // Si les deux sets sont identiques → correspondance directe S+E.
        // Si le nombre ou les numéros diffèrent → mode positionnel à plat.

        const tmdbSeasonNums = seasonsTmdbSorted.map((s) => s.season_number);
        const usePositional  =
            dbSeasonNums.length !== tmdbSeasonNums.length ||
            dbSeasonNums.some((n, i) => n !== tmdbSeasonNums[i]);

        // ── Chargement des épisodes TMDB par saison (nécessaire dans les deux modes)
        const tmdbEpisodesBySeason = new Map<number, TmdbEpisodeMeta[]>();

        for (const seasonTmdb of seasonsTmdbSorted) {
            try {
                const url = `${this.apiTMDBTv}/${seriesTmdbId}/season/${seasonTmdb.season_number}?${this.apiKeyTMDB}&${paramLanguage}`;
                const res = await lastValueFrom(this.httpService.get(url));
                tmdbEpisodesBySeason.set(
                    seasonTmdb.season_number,
                    (res.data.episodes as any[]).map((ep) => ({
                        episodeTmdbId: ep.id,
                        seasonTmdbId:  seasonTmdb.id,
                        seasonNumber:  seasonTmdb.season_number,
                        episodeNumber: ep.episode_number,
                        name:          ep.name,
                        overview:      ep.overview,
                        air_date:      ep.air_date,
                        still_path:    ep.still_path,
                    })),
                );
            } catch {
                tmdbEpisodesBySeason.set(seasonTmdb.season_number, []);
            }
        }

        // ── Séquence plate BDD (commune aux deux modes) ───────────────────────
        // dbFlat  : épisodes normaux (seasonNumber > 0 ET episodeNumber > 0)
        // dbBonus : bonus/non reconnus (seasonNumber = 0 OU episodeNumber = 0)

        const dbFlat:  DbEpisodeEntry[] = [];
        const dbBonus: DbEpisodeEntry[] = [];

        const sortedSeasonNums = [...seasonByNumber.keys()].sort((a, b) => a - b);

        for (const seasonNum of sortedSeasonNums) {
            const seasonML = seasonByNumber.get(seasonNum)!;
            const seasonEps: DbEpisodeEntry[] = [];

            for (const [key, mlList] of episodeBySeasonAndNum.entries()) {
                const [sStr, eStr] = key.split('_');
                if (parseInt(sStr, 10) !== seasonNum) continue;
                const episodeNumber = parseInt(eStr, 10);
                for (const ml of mlList) {
                    seasonEps.push({ seasonNumber: seasonNum, episodeNumber, ml, seasonML });
                }
            }

            seasonEps.sort((a, b) => {
                if (a.episodeNumber === 0 && b.episodeNumber !== 0) return 1;
                if (a.episodeNumber !== 0 && b.episodeNumber === 0) return -1;
                return a.episodeNumber - b.episodeNumber;
            });

            for (const entry of seasonEps) {
                if (entry.seasonNumber === 0 || entry.episodeNumber === 0) {
                    dbBonus.push(entry);
                } else {
                    dbFlat.push(entry);
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════════
        // MODE A — Correspondance directe (saisons identiques BDD ↔ TMDB)
        // ═════════════════════════════════════════════════════════════════════

        interface MappedEpisode {
            seasonNumber: number;
            seasonML:     MediaLibrary;
            episode:      EditEpisode;
        }

        const mapped: MappedEpisode[] = [];

        if (!usePositional) {

            for (const dbEp of dbFlat) {
                const tmdbSeasonEps = tmdbEpisodesBySeason.get(dbEp.seasonNumber) ?? [];
                const tmdbEp = tmdbSeasonEps.find((e) => e.episodeNumber === dbEp.episodeNumber);

                mapped.push({
                    seasonNumber: dbEp.seasonNumber,
                    seasonML:     dbEp.seasonML,
                    episode: {
                        id:             tmdbEp?.episodeTmdbId ?? 0,
                        seasonId:       tmdbEp?.seasonTmdbId  ?? 0,
                        mediaLibraryId: dbEp.ml.id,
                        name:           tmdbEp?.name ?? dbEp.ml.titleFormated,
                        episodeNumber:  dbEp.episodeNumber,
                        srcPoster:      tmdbEp?.still_path
                                            ? await this.getEntirelyUrlImagesFromTMDB(tmdbEp.still_path)
                                            : null,
                        description:    tmdbEp?.overview ?? undefined,
                        date:           tmdbEp?.air_date  ? new Date(tmdbEp.air_date) : undefined,
                        path:           dbEp.ml.path,
                    },
                });
            }

        // ═════════════════════════════════════════════════════════════════════
        // MODE B — Correspondance positionnelle à plat (saisons divergentes)
        // ═════════════════════════════════════════════════════════════════════

        } else {

            // Séquence plate TMDB dans l'ordre des saisons
            const tmdbFlat: TmdbEpisodeMeta[] = [];
            for (const sNum of tmdbSeasonNums) {
                tmdbFlat.push(...(tmdbEpisodesBySeason.get(sNum) ?? []));
            }

            for (let i = 0; i < dbFlat.length; i++) {
                const dbEp   = dbFlat[i];
                const tmdbEp = tmdbFlat[i]; // undefined si BDD > TMDB

                mapped.push({
                    seasonNumber: dbEp.seasonNumber,
                    seasonML:     dbEp.seasonML,
                    episode: {
                        id:             tmdbEp?.episodeTmdbId ?? 0,
                        seasonId:       tmdbEp?.seasonTmdbId  ?? 0,
                        mediaLibraryId: dbEp.ml.id,
                        name:           tmdbEp?.name ?? dbEp.ml.titleFormated,
                        episodeNumber:  dbEp.episodeNumber,
                        srcPoster:      tmdbEp?.still_path
                                            ? await this.getEntirelyUrlImagesFromTMDB(tmdbEp.still_path)
                                            : null,
                        description:    tmdbEp?.overview ?? undefined,
                        date:           tmdbEp?.air_date  ? new Date(tmdbEp.air_date) : undefined,
                        path:           dbEp.ml.path,
                    },
                });
            }
        }

        // ── Bonus — toujours sans correspondance TMDB ─────────────────────────

        for (const dbEp of dbBonus) {
            mapped.push({
                seasonNumber: dbEp.seasonNumber,
                seasonML:     dbEp.seasonML,
                episode: {
                    id:             0,
                    seasonId:       0,
                    mediaLibraryId: dbEp.ml.id,
                    name:           dbEp.ml.titleFormated,
                    episodeNumber:  dbEp.episodeNumber,
                    srcPoster:      null,
                    description:    undefined,
                    date:           undefined,
                    path:           dbEp.ml.path,
                },
            });
        }

        // ── Regroupement par saison BDD ───────────────────────────────────────

        const seasonMap = new Map<number, { seasonML: MediaLibrary; episodes: EditEpisode[] }>();
        for (const m of mapped) {
            if (!seasonMap.has(m.seasonNumber)) {
                seasonMap.set(m.seasonNumber, { seasonML: m.seasonML, episodes: [] });
            }
            seasonMap.get(m.seasonNumber)!.episodes.push(m.episode);
        }

        // ── Métadonnées de saison ─────────────────────────────────────────────

        // En mode positionnel, on calcule l'offset BDD pour retrouver la saison
        // TMDB de référence quand il n'y a pas d'équivalent direct.
        const seasonOffsets = new Map<number, number>();
        if (usePositional) {
            let off = 0;
            for (const sNum of sortedSeasonNums.filter((n) => n > 0)) {
                seasonOffsets.set(sNum, off);
                off += dbFlat.filter((e) => e.seasonNumber === sNum).length;
            }
        }

        // Séquence plate TMDB pour la recherche d'offset (mode positionnel)
        const tmdbFlatForOffset: TmdbEpisodeMeta[] = usePositional
            ? tmdbSeasonNums.flatMap((sNum) => tmdbEpisodesBySeason.get(sNum) ?? [])
            : [];

        const result: EditSeason[] = [];

        for (const [seasonNum, { seasonML, episodes }] of
            [...seasonMap.entries()].sort((a, b) => a[0] - b[0])
        ) {
            let refSeasonTmdb: any = seasonsTmdb.find((s) => s.season_number === seasonNum);

            // En mode positionnel, si pas d'équivalent direct, chercher via offset
            if (!refSeasonTmdb && usePositional && seasonNum > 0) {
                const off = seasonOffsets.get(seasonNum) ?? 0;
                const coveringEp = tmdbFlatForOffset[off];
                if (coveringEp) {
                    refSeasonTmdb = seasonsTmdb.find(
                        (s) => s.season_number === coveringEp.seasonNumber
                    );
                }
            }

            result.push({
                id:             refSeasonTmdb?.id   ?? 0,
                seriesId:       seriesTmdbId,
                mediaLibraryId: seasonML.id,
                name:           refSeasonTmdb?.name ?? seasonML.titleFormated,
                seasonNumber:   seasonNum,
                srcPoster:      refSeasonTmdb?.poster_path
                                    ? await this.getEntirelyUrlImagesFromTMDB(refSeasonTmdb.poster_path)
                                    : null,
                episodes,
            });
        }

        return result;
    }

    private async getCategories(categoriesTmbd: CategoryTmdb[]): Promise<CategorySimple[]> {
        const categoriesReturned: CategorySimple[] = [];
        try {
            const categoriesChocoPlus: CategorySimple[] = await this.categoryService.getAllCategories();
            categoriesTmbd.forEach((categoryTmdb: CategoryTmdb) => {
                const categoryChocoPlus: CategorySimple | null = categoriesChocoPlus.find((item) => item.tmdbId === categoryTmdb.id);
                if (categoryChocoPlus) {
                    categoriesReturned.push(categoryChocoPlus);
                }
            });
            return categoriesReturned;
        } catch (error) {
            return [];
        }
    }

    private getCreditsForMovie(credits: any): MediaCredit[] {
        try {
            const result: MediaCredit[] = [];
            let id: number = 0;
            let order: number = 0;
            credits.cast.forEach((item: any) => {
                id++;
                const credit: MediaCredit = {
                    id: id,
                    tmdbId: item.id,
                    fullName: item.name,
                    originalFullName: item.original_name,
                    character: item.character,
                    srcPoster: this.getUrlImageTMBD(item.profile_path),
                    job: Job.ACTOR,
                    order: item.order
                }
                if (item.order > order) {
                    order = item.order
                }
                result.push(credit);
            });
            const filteredCrew = credits.crew
                .filter(member => Object.values(Job).includes(member.job.toUpperCase() as Job))
                .map(member => ({ ...member, job: member.job.toUpperCase() as Job }));

            filteredCrew.forEach((item: any) => {
                id++;
                order++;
                const credit: MediaCredit = {
                    id: id,
                    tmdbId: item.id,
                    fullName: item.name,
                    originalFullName: item.original_name,
                    character: null,
                    srcPoster: this.getUrlImageTMBD(item.profile_path),
                    job: item.job,
                    order: order
                }
                result.push(credit);
            });
            return result;
        } catch (error) {
            return [];
        }
    }

    private getCreditsForSeries(credits: any, creators: any): MediaCredit[] {
        try {
            const result: MediaCredit[] = [];
            let id: number = 0;
            let order: number = 0;
            credits.cast.forEach((item: any) => {
                if (item.roles) {
                    item.roles.forEach((role: any) => {
                        id++;
                        const credit: MediaCredit = {
                            id: id,
                            tmdbId: item.id,
                            fullName: item.name,
                            originalFullName: item.original_name,
                            character: role.character,
                            srcPoster: this.getUrlImageTMBD(item.profile_path),
                            job: Job.ACTOR,
                            episodeCount: role.episode_count,
                            order: item.order
                        }
                        result.push(credit);
                        if (item.order > order) {
                            order = item.order
                        }
                    });
                }
            });
            if (creators) {
                creators.forEach((item) => {
                    id++;
                    order++;
                    result.push({
                        id: id,
                        tmdbId: item.id,
                        fullName: item.name,
                        originalFullName: item.original_name,
                        character: null,
                        srcPoster: this.getUrlImageTMBD(item.profile_path),
                        job: Job.CREATOR,
                        episodeCount: 0,
                        order: order
                    })
                });
            }
            const jobs: Job[] = Object.values(Job);
            credits.crew.forEach((item: any) => {
                if (item.jobs) {
                    item.jobs.forEach((job: any) => {
                        const jobFormated: Job = job.job?.toUpperCase() as Job;
                        if (jobs.includes(jobFormated)) {
                            id++;
                            order++;
                            const credit: MediaCredit = {
                                id: id,
                                tmdbId: item.id,
                                fullName: item.name,
                                originalFullName: item.original_name,
                                character: null,
                                srcPoster: this.getUrlImageTMBD(item.profile_path),
                                job: jobFormated,
                                episodeCount: job.episode_count,
                                order: order
                            }
                            result.push(credit);
                        }
                    })
                }
            })
            return result;
        } catch (error) {
            return [];
        }
    }

    private getKeyWords(keywords: any): string[] {
        try {
            const keywordList: string[] = keywords.map(item => item.name);
            return keywordList;
        } catch (error) {
            return [];
        }
    }

    private getAllTitlesFromDifferentLanguage(translations: any, mediaType: MediaType, originalTitle: string | null): TranslationTitle[] {
        try {
            const languages: ISO_3166_1[] = Object.values(ISO_3166_1);
            const otherTitle: TranslationTitle[] = [];
            if (originalTitle) {
                otherTitle.push({
                    title: originalTitle,
                    iso_639_1: ISO_3166_1.VO
                })
            }
            languages.forEach((language: ISO_3166_1) => {
                try {
                    const title: any[] = translations.filter(item => item.iso_3166_1 === language);
                    if (mediaType === MediaType.MOVIE) {
                        if (title && title.length >= 0 && title[0].data.title && title[0].data.title !== '') {
                            otherTitle.push({
                                title: title[0].data.title,
                                iso_639_1: language,
                            })
                        }
                    } else if (mediaType === MediaType.SERIES) {
                        if (title && title.length >= 0 && title[0].data.name && title[0].data.name !== '') {
                            otherTitle.push({
                                title: title[0].data.name,
                                iso_639_1: language,
                            })
                        }
                    }

                } catch {
                }
            })
            return otherTitle;
        } catch (error) {
            return [];
        }
    }

    private async getImageByTmdbId(response: any, nbPoster: number, iso: ISO_3166_1): Promise<{ back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] }> {
        const posterVertical: EditPoster[] = [];
        const posterHorizontal: EditPoster[] = [];
        let back: any = null;

        let backs: any[] = response.data.backdrops
            .filter((back: any) => back.file_path && back.iso_639_1 === null)
            .sort((a: any, b: any) => b.vote_average - a.vote_average)
            .map((back: any) => back.file_path);

        if (backs.length > 0) {
            back = await this.getEntirelyUrlImagesFromTMDB(backs[0]);
            backs.shift();
            backs = await Promise.all(
                backs
                    .slice(0, nbPoster)
                    .map((backTmp: any) => this.getEntirelyUrlImagesFromTMDB(backTmp))
            );
        }

        const byLangThenScore = (a: any, b: any) => {
            const order = (lang?: string) => (iso && lang === iso ? 0 : lang === ISO_3166_1.US || lang === ISO_3166_1.GB ? 1 : 2);
            const langDiff = order(a?.iso_3166_1) - order(b?.iso_3166_1);
            if (langDiff !== 0) return langDiff;
            return (b?.vote_average ?? 0) - (a?.vote_average ?? 0);
        };

        // LOGOS (max 1)
        const logoPaths: string[] = (response.data?.logos ?? [])
            .filter((logo: any) => !!logo.file_path)
            .sort(byLangThenScore)
            .slice(0, 1)
            .map((logo: any) => logo.file_path);

        const logos: any[] = await Promise.all(
            logoPaths.map((p) => this.getEntirelyUrlImagesFromTMDB(p))
        );

        // POSTERS (max nbPoster)
        const posterPaths: string[] = (response.data?.posters ?? [])
            .filter((poster: any) => !!poster.file_path)
            .sort(byLangThenScore)
            .slice(0, nbPoster)
            .map((poster: any) => poster.file_path);

        const posters: any[] = await Promise.all(
            posterPaths.map((p) => this.getEntirelyUrlImagesFromTMDB(p))
        );

        let i: number = 0;
        posters.forEach((poster: string) => {
            posterVertical.push({
                id: i,
                srcPoster: poster,
                typePoster: [{
                    id: i + 1,
                    type_id: SelectionType.NORMAL_POSTER
                }]
            });
            i++;
        })
        backs.forEach((back: string) => {
            posterHorizontal.push({
                id: i,
                srcPoster: back,
                typePoster: [{
                    id: i + 1,
                    type_id: SelectionType.NORMAL_POSTER
                }]
            });
            i++;
        });

        const image: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] } = {
            back: back,
            logo: logos.length > 0 ? logos[0] : null,
            posterVertical: posterVertical,
            posterHorizontal: posterHorizontal
        }
        return image;
    }

    private getUrlImageTMBD(url: string): string | null {
        if (url) {
            return `https://image.tmdb.org/t/p/original/${url}`;
        } else {
            return null;
        }
    }

    public async getEntirelyUrlImagesFromTMDB(url: string): Promise<string | null | ArrayBuffer> {
        if (url && url.trim() !== '') {
            return await this.toBase64(this.getUrlImageTMBD(url));
        } else {
            return null;
        }
    }

    private async toBase64(url: any): Promise<string | null | ArrayBuffer> {
        if (!url) return null;

        try {
            const response = await fetch(url);
            const buffer = await response.buffer();
            const contentType = response.headers.get('content-type') || 'image/jpeg';

            const base64 = buffer.toString('base64');
            return `data:${contentType};base64,${base64}`;
        } catch (error) {
            return null;
        }
    }

    public async searchCreditByTmdbId(id: number): Promise<Credit> {
        const url: string = `${this.apiTMDBPerson}/${id}?${this.apiKeyTMDB}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const data = response.data;
        const originalName: string = data.also_known_as?.find(n => /[^\u0000-\u00ff]/.test(n))
                            || data.also_known_as[0]
                            || data.name;
        const credit: Credit = {
            id: -1,
            tmdbId: id,
            fullName: data.name,
            originalFullName: originalName,
            srcPoster: await this.getEntirelyUrlImagesFromTMDB(data.profile_path)
        }
        return credit;
    }
    public async searchCreditByFullName(fullName: string): Promise<Credit> {
        const url: string = `${this.apiTMDBSearchPerson}?${this.apiKeyTMDB}&query=${fullName}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const data = response.data.results[0];
        const credit: Credit = {
            id: -1,
            tmdbId: data.id,
            fullName: data.name,
            originalFullName: data.original_name,
            srcPoster: await this.getEntirelyUrlImagesFromTMDB(data.profile_path)
        }
        return credit;
    }

    // ==============================================
    // FONCTION USED INTO CREDIT MODULE
    // ==============================================
    public async fetchCreditForMovie(movie: Movie): Promise<MediaCredit[]> {
        const tmdbId: number | null = await this.libraryService.getTmdbIdByMediaLibrary(movie.mediaLibraryId);
        const url: string = `${this.apiTMDBMovie}/${tmdbId}?${this.apiKeyTMDB}&append_to_response=credits`;
        const response = await lastValueFrom(this.httpService.get(url));
        const credits: MediaCredit[] = this.getCreditsForMovie(response.data.credits);
        return credits;
    }

    public async fetchCreditForSeries(series: Series): Promise<MediaCredit[]> {
        const tmdbId: number | null = await this.libraryService.getTmdbIdByMediaLibrary(series.mediaLibraryId);
        const url: string = `${this.apiTMDBTv}/${tmdbId}?${this.apiKeyTMDB}&append_to_response=aggregate_credits`;
        const response = await lastValueFrom(this.httpService.get(url));
        const credits: MediaCredit[] = this.getCreditsForSeries(response.data.aggregate_credits, response.data.created_by);
        return credits;
    }

    // ==============================================
    // FONCTION USED INTO CATEGORY MODULE
    // ==============================================
    public async getAllCategoryFromMovies(): Promise<CategoryTmdb[]> {
        const url: string = `${this.apiTMDBGenreMovie}?${this.apiKeyTMDB}`;
        const response = await lastValueFrom(this.httpService.get(url));
        return response.data.genres;
    }
    public async getAllCategoryFromSeries(): Promise<CategoryTmdb[]> {
        const url: string = `${this.apiTMDBGenreSeries}?${this.apiKeyTMDB}`;
        const response = await lastValueFrom(this.httpService.get(url));
        return response.data.genres;
    }

}
