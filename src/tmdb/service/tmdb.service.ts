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
            const param: string = `&query=${title}&primary_release_year=${year}`;
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
    public async searchSeriesByTitle(title: string): Promise<any> {
        const param: string = `&query=${title}`;
        const url: string = `${this.apiTMDBSearchTv}?${this.apiKeyTMDB}${param}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const id: number = Number(response.data.results[0].id);
        return await this.searchSeriesByTmdbId(id, null);
    }

    public async searchSeriesByMediaLibraryId(mediaLibraryId: string): Promise<EditMovie> {
        const tmdbId: number | null = await this.libraryService.getTmdbIdByMediaLibrary(mediaLibraryId);
        if (tmdbId) {
            return await this.searchSeriesByTmdbId(tmdbId, null);
        } else {
            return null;
        }
    }

    public async searchSeriesByTmdbId(id: number, lang: ISO_3166_1): Promise<any> {
        const mediaLibraryId: string | null = await this.libraryService.getMediaLibraryIdByTmdbId(id);
        if (!lang) {
            lang = await this.libraryService.getLanguageByMediaLibraryTmdbId(id);
        }
        const paramLanguage = this.getParamLanguage(lang);

        const url: string = `${this.apiTMDBTv}/${id}?${this.apiKeyTMDB}&append_to_response=aggregate_credits,translations,keywords&${paramLanguage}`;
        const response = await lastValueFrom(this.httpService.get(url));

        const categories: CategorySimple[] = await this.getCategories(response.data.genres);
        const credits: MediaCredit[] = this.getCreditsForSeries(response.data.aggregate_credits, response.data.created_by);
        const keywords: string[] = this.getKeyWords(response.data.keywords.results);
        const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(response.data.translations.translations, MediaType.SERIES, response.data.original_name);

        let images: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] };
        try {
            const urlPoster: string = `${this.apiTMDBTv}/${id}/images?${this.apiKeyTMDB}`;
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

        const seasons: EditSeason[] = await this.getAllSeasonsBySeries(id, response.data.seasons, paramLanguage);

        let series: EditSeries = {
            id: id,
            title: response.data.name,
            mediaLibraryId: mediaLibraryId,
            otherTitles: otherLanguage,
            categories: categories,
            keyWords: keywords,
            description: response.data.overview,
            credits: credits,
            date: response.data.first_air_date,
            startShow: '00:00:00',
            endShow: '00:00:00',
            posters: images.posterVertical,
            logo: images.logo,
            backgroundImage: images.back,
            seasons: seasons,
            horizontalPoster: images.posterHorizontal,
            horizontalPosterSameAsBackground: false
        }

        return series;
    }

    private async getAllSeasonsBySeries(id: number, seasonsTmbd: any[], paramLanguage: string): Promise<any> {
        const seasons: EditSeason[] = [];
        for (const season of seasonsTmbd) {
            const episodes: EditEpisode[] = await this.getAllEpisodesBySeason(id, season.id, season.season_number, paramLanguage);
            seasons.push({
                id: season.id,
                seriesId: id,
                mediaLibraryId: undefined,
                name: season.name,
                seasonNumber: season.season_number,
                episodes: episodes,
                srcPoster: await this.getEntirelyUrlImagesFromTMDB(season.poster_path)
            });
        }
        return seasons;
    }

    private async getAllEpisodesBySeason(id: number, idSeason: number, numSeason: number, paramLanguage: string): Promise<EditEpisode[]> {
        try {
            const url: string = `${this.apiTMDBTv}/${id}/season/${numSeason}?${this.apiKeyTMDB}&${paramLanguage}`;
            const response = await lastValueFrom(this.httpService.get(url));
            const episodes: EditEpisode[] = [];
            for (const episode of response.data.episodes) {
                episodes.push({
                    id: episode.id,
                    seasonId: idSeason,
                    mediaLibraryId: undefined,
                    name: episode.name,
                    episodeNumber: episode.episode_number,
                    srcPoster: await this.getEntirelyUrlImagesFromTMDB(episode.still_path),
                    description: episode.overview,
                    date: episode.air_date,
                });
            }
            return episodes;
        } catch (error) {
            return [];
        }
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
            console.error('Erreur de conversion en base64:', error);
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
