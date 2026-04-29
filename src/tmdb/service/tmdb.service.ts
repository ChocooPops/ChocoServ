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
import { SearchService } from "src/common-service/search.service";
import { JellyfinService } from "src/jellyfin/service/jellyfin.service";
import { ConfigService } from "@nestjs/config";
import { MediaCredit } from "src/credit/dto/media-credit.interface";
import { Job } from "src/credit/dto/job.enum";
import { Movie } from "src/movie/dto/movie.interface";
import { Series } from "src/series/dto/series.interface";

@Injectable()
export class TmdbService {

    constructor(private readonly httpService: HttpService,
        private readonly categoryService: CategoryService,
        private readonly searchService: SearchService,
        @Inject(forwardRef(() => JellyfinService))
        private readonly jellyfinService: JellyfinService,
        private readonly configService: ConfigService
    ) { }

    private readonly apiKeyTMDB: string = `api_key=${this.configService.get<string>('TMDB_API_KEY')}`;
    private readonly baseUrlTmdb: string = this.configService.get<string>('TMDB_BASE_URL');

    private readonly paramLanguage: string = 'language=fr-FR';

    private readonly apiTMDBSearchMovie: string = `${this.baseUrlTmdb}/search/movie`;
    private readonly apiTMDBMovie: string = `${this.baseUrlTmdb}/movie`;

    private readonly apiTMDBTv: string = `${this.baseUrlTmdb}/tv`;
    private readonly apiTMDBSearchTv: string = `${this.baseUrlTmdb}/search/tv`;

    public async searchMoviebByTitle(title: string): Promise<any> {
        const param: string = `&query=${title}`;
        const url: string = `${this.apiTMDBSearchMovie}?${this.apiKeyTMDB}${param}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const id: number = Number(response.data.results[0].id);
        return await this.searchMovieByTmdbId(id);
    }

    public async searchMovieByJellyfinId(jellyfinId: string): Promise<EditMovie> {
        const tmdbId: number | null = await this.jellyfinService.getTmdbIdByJellyfinIdForMovie(jellyfinId);
        if (tmdbId) {
            return await this.searchMovieByTmdbId(tmdbId);
        } else {
            return null;
        }
    }

    public async searchMovieByTmdbId(id: number): Promise<EditMovie> {
        const jellyfinId: string | null = await this.jellyfinService.getJellyfinIdByTmdbIdForMovie(id.toString());
        const url: string = `${this.apiTMDBMovie}/${id}?${this.apiKeyTMDB}&${this.paramLanguage}&append_to_response=credits,translations,keywords`;
        const response = await lastValueFrom(this.httpService.get(url));

        const categories: CategorySimple[] = await this.getCategories(response.data.genres);
        const credits: MediaCredit[] = this.getCreditsForMovie(response.data.credits);
        const keywords: string[] = this.getKeyWords(response.data.keywords.keywords);
        const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(response.data.translations.translations, MediaType.MOVIE, response.data.original_title);

        let images: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] };
        try {
            const urlPoster: string = `${this.apiTMDBMovie}/${id}/images?${this.apiKeyTMDB}`;
            const responsePoster = await lastValueFrom(this.httpService.get(urlPoster));
            images = await this.getImageByTmdbId(responsePoster, 1);
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
            jellyfinId: jellyfinId,
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

    public async searchSeriesByTitle(title: string): Promise<any> {
        const param: string = `&query=${title}`;
        const url: string = `${this.apiTMDBSearchTv}?${this.apiKeyTMDB}${param}`;
        const response = await lastValueFrom(this.httpService.get(url));
        const id: number = Number(response.data.results[0].id);
        return await this.searchSeriesByTmdbId(id);
    }

    public async searchSeriesByTmdbId(id: number): Promise<any> {
        const jellyfinId: string | null = await this.jellyfinService.getJellyfinIdByTmdbIdForSeries(id.toString());
        const url: string = `${this.apiTMDBTv}/${id}?${this.apiKeyTMDB}&append_to_response=aggregate_credits,translations,keywords&${this.paramLanguage}`;
        const response = await lastValueFrom(this.httpService.get(url));

        const categories: CategorySimple[] = await this.getCategories(response.data.genres);
        const credits: MediaCredit[] = this.getCreditsForSeries(response.data.aggregate_credits);
        const keywords: string[] = this.getKeyWords(response.data.keywords.results);
        const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(response.data.translations.translations, MediaType.SERIES, response.data.original_name);

        let images: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] };
        try {
            const urlPoster: string = `${this.apiTMDBTv}/${id}/images?${this.apiKeyTMDB}`;
            const responsePoster = await lastValueFrom(this.httpService.get(urlPoster));
            images = await this.getImageByTmdbId(responsePoster, 1);
        } catch (error) {
            images = {
                back: null,
                logo: null,
                posterVertical: [],
                posterHorizontal: []
            }
        }

        const seasons: EditSeason[] = await this.getAllSeasonsBySeries(id, response.data.seasons);

        let series: EditSeries = {
            id: id,
            title: response.data.name,
            jellyfinId: jellyfinId,
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

        try {
            if (jellyfinId) {
                const seasonsJellyfin: any[] = await this.jellyfinService.getAllSeasonsByJellyfinIdSeries(jellyfinId);
                const episodesJellyfin: any[] = await this.jellyfinService.getAllEpisodesByJellyfinIdSeries(jellyfinId);

                series.seasons.forEach((season: EditSeason) => {
                    const seasonJellyfinId: string | null = seasonsJellyfin.find((item: any) => item.IndexNumber === season.seasonNumber)?.Id;
                    if (seasonJellyfinId) {
                        season.jellyfinId = seasonJellyfinId;

                        if (seasonsJellyfin.length > 1) {
                            const episodeFiltered: any[] = episodesJellyfin.filter((item: any) => item.SeasonId === seasonJellyfinId)
                            season.episodes.forEach((episode: EditEpisode, idx: number) => {

                                if (episodeFiltered.length > idx && episodeFiltered[idx]?.Id) {
                                    episode.jellyfinId = episodeFiltered[idx].Id;
                                }
                            });
                        } else {
                            if (season.seasonNumber === 1) {
                                season.episodes.forEach((episode: EditEpisode, idx: number) => {
                                    if (episodesJellyfin.length > idx && episodesJellyfin[idx]?.Id) {
                                        episode.jellyfinId = episodesJellyfin[idx].Id;
                                    }
                                })
                            }
                        }
                    }
                });
            }
        } catch (error) {

        }

        return series;
    }

    private async getAllSeasonsBySeries(id: number, seasonsTmbd: any[]): Promise<any> {
        const seasons: EditSeason[] = [];
        for (const season of seasonsTmbd) {
            const episodes: EditEpisode[] = await this.getAllEpisodesBySeason(id, season.id, season.season_number);
            seasons.push({
                id: season.id,
                seriesId: id,
                jellyfinId: undefined,
                name: season.name,
                seasonNumber: season.season_number,
                episodes: episodes,
                srcPoster: await this.getEntirelyUrlImagesFromTMDB(season.poster_path)
            });
        }
        return seasons;
    }

    private async getAllEpisodesBySeason(id: number, idSeason: number, numSeason: number): Promise<EditEpisode[]> {
        try {
            const url: string = `${this.apiTMDBTv}/${id}/season/${numSeason}?${this.apiKeyTMDB}&${this.paramLanguage}`;
            const response = await lastValueFrom(this.httpService.get(url));
            const episodes: EditEpisode[] = [];
            for (const episode of response.data.episodes) {
                episodes.push({
                    id: episode.id,
                    seasonId: idSeason,
                    jellyfinId: undefined,
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

    public async searchSeriesByJellyfinId(idJellyfin: string): Promise<EditSeries> {
        const itemJellyfin: any = await this.jellyfinService.getItemJellyFinByIdForSeries(idJellyfin);
        if (itemJellyfin && itemJellyfin.ProviderIds.Tmdb) {

            const id: number = Number(itemJellyfin.ProviderIds.Tmdb);
            const url: string = `${this.apiTMDBTv}/${id}?${this.apiKeyTMDB}&append_to_response=aggregate_credits,translations,keywords&${this.paramLanguage}`;
            const response = await lastValueFrom(this.httpService.get(url));
            const categories: CategorySimple[] = await this.getCategories(response.data.genres);
            const credits: MediaCredit[] = this.getCreditsForSeries(response.data.aggregate_credits);
            const keywords: string[] = this.getKeyWords(response.data.keywords.results);
            const otherLanguage: TranslationTitle[] = this.getAllTitlesFromDifferentLanguage(response.data.translations.translations, MediaType.SERIES, response.data.original_name);

            let images: { back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] };
            try {
                const urlPoster: string = `${this.apiTMDBTv}/${id}/images?${this.apiKeyTMDB}`;
                const responsePoster = await lastValueFrom(this.httpService.get(urlPoster));
                images = await this.getImageByTmdbId(responsePoster, 1);
            } catch (error) {
                images = {
                    back: null,
                    logo: null,
                    posterVertical: [],
                    posterHorizontal: []
                }
            }

            const seasons: EditSeason[] = await this.getAllSeasonsBySeriesJellyfinId(idJellyfin, id);

            let series: EditSeries = {
                id: id,
                title: response.data.name,
                jellyfinId: idJellyfin,
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
        return null;
    }

    private async getAllSeasonsBySeriesJellyfinId(idJellyfin: string, idSeries: number): Promise<EditSeason[]> {
        const itemsSeasons: any[] = await this.jellyfinService.getAllSeasonsByJellyfinIdSeries(idJellyfin);
        const itemEpisodes: any[] = await this.jellyfinService.getAllEpisodesByJellyfinIdSeries(idJellyfin);

        const seasons: EditSeason[] = [];

        if (itemsSeasons && itemsSeasons.length > 0) {
            if (itemsSeasons.length > 1) {
                let seasonNumber: number = 1;
                for (const season of itemsSeasons) {
                    const episodes: EditEpisode[] = [];
                    const itemEpisodesFiltered: any[] = itemEpisodes?.filter((item: any) => item.SeasonId === season.Id) || [];
                    let episodeNumber: number = 1;
                    for (const item of itemEpisodesFiltered) {
                        episodes.push({
                            id: episodeNumber,
                            seasonId: season.Id,
                            jellyfinId: item.Id,
                            name: item.Name,
                            episodeNumber: episodeNumber,
                            description: item.Overview,
                            date: item.PremiereDate ? new Date(item.PremiereDate) : new Date(),
                            srcPoster: await this.getEntirelyUrlImagesFromJellyfin(item.Id, 'Primary')
                        })
                        episodeNumber++;
                    }
                    seasons.push({
                        id: seasonNumber,
                        seriesId: idSeries,
                        jellyfinId: season.Id,
                        name: season.Name,
                        seasonNumber: seasonNumber,
                        srcPoster: await this.getEntirelyUrlImagesFromJellyfin(season.Id, 'Primary'),
                        episodes: episodes
                    })
                    seasonNumber++;
                }
            } else {
                const season: any = itemsSeasons[0];
                const episodes: EditEpisode[] = [];
                let episodeNumber: number = 1;
                for (const episode of itemEpisodes) {
                    episodes.push({
                        id: episodeNumber,
                        seasonId: season.Id,
                        jellyfinId: episode.Id,
                        name: episode.Name,
                        episodeNumber: episodeNumber,
                        description: episode.Overview,
                        date: episode.PremiereDate ? new Date(episode.PremiereDate) : new Date(),
                        srcPoster: await this.getEntirelyUrlImagesFromJellyfin(episode.Id, 'Primary')
                    })
                    episodeNumber++;
                }
                seasons.push({
                    id: 1,
                    seriesId: idSeries,
                    jellyfinId: season.Id,
                    name: season.Name,
                    seasonNumber: 1,
                    srcPoster: await this.getEntirelyUrlImagesFromJellyfin(season.Id, 'Primary'),
                    episodes: episodes
                })
            }
        }

        return seasons;
    }

    private async getCategories(categoriesTmbd: CategorySimple[]): Promise<CategorySimple[]> {
        const categoriesReturned: CategorySimple[] = [];
        try {

            categoriesTmbd = categoriesTmbd.flatMap(item =>
                item.name.split("&").map(namePart => ({
                    id: item.id,
                    name: namePart.trim(),
                }))
            );

            const categoriesChocoPlus: CategorySimple[] = await this.categoryService.getAllCategories();
            categoriesTmbd.forEach((categoryTmdb: CategorySimple) => {
                const categoriesSelected: CategorySimple[] = categoriesChocoPlus
                    .filter((item: CategorySimple) =>
                        this.searchService.levenshteinDistance(item.name, categoryTmdb.name) <= 2
                    )
                    .sort((a, b) =>
                        this.searchService.levenshteinDistance(a.name, categoryTmdb.name)
                        - this.searchService.levenshteinDistance(b.name, categoryTmdb.name)
                    );
                if (categoriesSelected.length > 0) {
                    categoriesReturned.push(categoriesSelected[0]);
                }
            })
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

    private getCreditsForSeries(credits: any): MediaCredit[] {
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
            console.log(error)
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
            const languages: ISO_3166_1[] = [ISO_3166_1.US, ISO_3166_1.FR, ISO_3166_1.IT, ISO_3166_1.ES, ISO_3166_1.DE, ISO_3166_1.RU, ISO_3166_1.JP, ISO_3166_1.CN, ISO_3166_1.KR, ISO_3166_1.PT];
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

    private async getImageByTmdbId(response: any, nbPoster: number): Promise<{ back: string, logo: string, posterVertical: EditPoster[], posterHorizontal: EditPoster[] }> {
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
            const order = (lang?: string) => (lang === 'fr' ? 0 : lang === 'en' ? 1 : 2);
            const langDiff = order(a?.iso_639_1) - order(b?.iso_639_1);
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

    private async getEntirelyUrlImagesFromJellyfin(url: string, suffix: 'Primary' | 'Thumb' | 'Backdrop' | 'Logo'): Promise<string | null | ArrayBuffer> {
        if (url) {
            url = `http://localhost:8096/Items/${url}/Images/${suffix}`;
            return await this.toBase64(url);
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

    public async fetchCreditForMovie(movie: Movie): Promise<MediaCredit[]> {
        const tmdbId: number | null = await this.jellyfinService.getTmdbIdByJellyfinIdForMovie(movie.jellyfinId);
        const url: string = `${this.apiTMDBMovie}/${tmdbId}?${this.apiKeyTMDB}&append_to_response=credits`;
        const response = await lastValueFrom(this.httpService.get(url));
        const credits: MediaCredit[] = this.getCreditsForMovie(response.data.credits);
        return credits;
    }

    public async fetchCreditForSeries(series: Series): Promise<MediaCredit[]> {
        const tmdbId: number | null = await this.jellyfinService.getTmdbIdByJellyfinIdForSeries(series.jellyfinId);
        const url: string = `${this.apiTMDBTv}/${tmdbId}?${this.apiKeyTMDB}&append_to_response=aggregate_credits`;
        const response = await lastValueFrom(this.httpService.get(url));
        const credits: MediaCredit[] = this.getCreditsForSeries(response.data.aggregate_credits);
        return credits;
    }

}
