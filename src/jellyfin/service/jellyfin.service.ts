import { forwardRef, Injectable, Inject } from "@nestjs/common";
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from "rxjs";
import { MovieJellyfinInfo } from "src/movie/dto/jellyfin-info.interface";
import { MovieService } from "src/movie/service/movie.service";
import { EditMovie } from "src/movie/dto/edit-movie.interface";
import { ReturnMessage } from "src/common-interface/return-message.interface";
import { TmdbService } from "src/tmdb/service/tmdb.service";
import { EditSeries } from "src/series/dto/edit-series.interface";
import { SeriesService } from "src/series/service/series.service";
import { Node } from "src/common-interface/node.interface";
import { Media } from "src/media/dto/media.interface";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JellyfinService {

    private httpPort: string = this.configService.get<string>('JELLYFIN_URL');
    private urlItmes: string = 'Items';
    private urlShows: string = 'Shows';
    private apiKey: string = `api_key=${this.configService.get<string>('JELLYFIN_API_KEY')}`;
    private allJellyfinItemsMovie: any[] | null;
    private allJellyfinItemsSeries: any[] | null;

    constructor(private readonly httpService: HttpService,
        @Inject(forwardRef(() => MovieService))
        private readonly movieService: MovieService,
        @Inject(forwardRef(() => SeriesService))
        private readonly seriesService: SeriesService,
        @Inject(forwardRef(() => TmdbService))
        private readonly tmdbService: TmdbService,
        private readonly configService: ConfigService
    ) { }

    private async setAllJellyfinItemsMovie(): Promise<void> {
        if (!this.allJellyfinItemsMovie) {
            const url: string = `${this.httpPort}/${this.urlItmes}?${this.apiKey}&IncludeItemTypes=Movie&Recursive=true&Fields=MediaStreams,ProviderIds`;
            const response = await lastValueFrom(this.httpService.get(url));
            this.allJellyfinItemsMovie = response.data.Items;
        }
    }
    private async setAllJellyfinItemsSeries(): Promise<void> {
        if (!this.allJellyfinItemsSeries) {
            const url: string = `${this.httpPort}/${this.urlItmes}?${this.apiKey}&IncludeItemTypes=Series&Recursive=true&Fields=MediaStreams,ProviderIds`;
            const response = await lastValueFrom(this.httpService.get(url));
            this.allJellyfinItemsSeries = response.data.Items;
        }
    }

    public async resetAllJellyfinItemsMovie(): Promise<any> {
        this.allJellyfinItemsMovie = null;
        await this.setAllJellyfinItemsMovie();
        return this.allJellyfinItemsMovie;
    }

    public async resetAllJellyfinItemsSeries(): Promise<any> {
        this.allJellyfinItemsSeries = null;
        await this.setAllJellyfinItemsSeries();
        return this.allJellyfinItemsSeries;
    }

    private async getItemJellyFinByIdForMovie(id: string): Promise<any> {
        await this.setAllJellyfinItemsMovie();
        const item: any = this.allJellyfinItemsMovie.find((item: any) => item.Id === id);
        return item;
    }

    public async getItemJellyFinByIdForSeries(id: string): Promise<any> {
        await this.setAllJellyfinItemsSeries();
        const item: any = this.allJellyfinItemsSeries.find((item: any) => item.Id === id);
        return item;
    }

    public async getAllSeasonsByJellyfinIdSeries(id: string): Promise<any[]> {
        const url: string = `${this.httpPort}/${this.urlShows}/${id}/Seasons?${this.apiKey}&Recursive=true&Fields=MediaStreams,ProviderIds`;
        const response = await lastValueFrom(this.httpService.get(url));
        return response.data.Items;
    }

    public async getAllEpisodesByJellyfinIdSeries(id: string): Promise<any[]> {
        const url: string = `${this.httpPort}/${this.urlShows}/${id}/Episodes?${this.apiKey}&Recursive=true&Fields=MediaStreams,ProviderIds,Overview`;
        const response = await lastValueFrom(this.httpService.get(url));
        return response.data.Items;
    }

    public async getJellyfinIdByTmdbIdForMovie(tmdbId: string): Promise<string | null> {
        try {
            await this.setAllJellyfinItemsMovie();
            const id: string | null = this.allJellyfinItemsMovie.find((item: any) => item.ProviderIds.Tmdb && item.ProviderIds.Tmdb === tmdbId)?.Id;
            return id;
        } catch (error) {
            return null;
        }
    }

    public async getTmdbIdByJellyfinId(jellyfinId: string): Promise<number | null> {
        try {
            await this.setAllJellyfinItemsMovie();
            const item: any = this.allJellyfinItemsMovie.find((item: any) => item.Id && item.Id === jellyfinId);
            if (item.ProviderIds.Tmdb) {
                return Number(item.ProviderIds.Tmdb);
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    public async getJellyfinIdByTmdbIdForSeries(tmdbId: string): Promise<string | null> {
        try {
            await this.setAllJellyfinItemsSeries();
            const id: string | null = this.allJellyfinItemsSeries.find((item: any) => item.ProviderIds.Tmdb && item.ProviderIds.Tmdb === tmdbId)?.Id;
            return id;
        } catch (error) {
            return null;
        }
    }

    public async getInfoJellyfin(id: string): Promise<MovieJellyfinInfo> {
        try {
            const item: any = await this.getItemJellyFinByIdForMovie(id);
            if (item) {
                const runTimeTicks: number = Number(item.RunTimeTicks ? item.RunTimeTicks : 0);
                const width: number = item.MediaStreams[0].Width ? item.MediaStreams[0].Width : 0;
                let quality: string;
                if (width > 0) {
                    if (width >= 3000) {
                        quality = '4K';
                    } else if (width >= 2000) {
                        quality = '2K';
                    } else if (width >= 1000) {
                        quality = '1080p';
                    } else {
                        quality = '720p';
                    }
                } else {
                    quality = 'any quality';
                }

                return {
                    id: 1,
                    runTimeTicks: runTimeTicks,
                    quality: quality
                }
            } else {
                return {
                    id: null,
                    runTimeTicks: 0,
                    quality: null
                }
            }
        } catch (error) {
            return {
                id: null,
                runTimeTicks: 0,
                quality: null
            }
        }
    }

    public async resetAllMovies(): Promise<any> {
        await this.setAllJellyfinItemsMovie();
        await this.movieService.deleteAllMediaByType();
        const succes: any[] = [];
        const echec: any[] = [];
        for (const item of this.allJellyfinItemsMovie) {
            if (item.ProviderIds.Tmdb) {
                try {
                    const idTmdb: number = Number(item.ProviderIds.Tmdb);
                    const result: EditMovie = await this.tmdbService.searchMovieByTmdbId(idTmdb);
                    const message: ReturnMessage = await this.movieService.insertNewMovie(result, false);
                    if (message.state) {
                        console.log("success : " + result.title);
                        succes.push(result.title);
                    } else {
                        console.log("echec : " + result.title);
                        echec.push(result.title);
                    }
                } catch (error) {
                    console.log("échec Id : " + item.Id);
                    echec.push(`${item.Name} ____ ${item.Id}`)
                }
            }
        };
        return {
            success: succes,
            echec: echec
        };
    }

    public async resetAllSeries(): Promise<any> {
        await this.setAllJellyfinItemsSeries();
        await this.seriesService.deleteAllMediaByType();
        const succes: any[] = [];
        const echec: any[] = [];
        for (const item of this.allJellyfinItemsSeries) {
            if (item.Id) {
                try {
                    const result: EditSeries = await this.tmdbService.searchSeriesByJellyfinId(item.Id);
                    const message: ReturnMessage = await this.seriesService.insertNewSeries(result, false);
                    if (message.state) {
                        console.log("success : " + result.title);
                        succes.push(result.title);
                    } else {
                        console.log("echec : " + result.title);
                        echec.push(result.title);
                    }
                } catch (error) {
                    console.log("échec Id : " + item.Id);
                    echec.push(`${item.Name} ____ ${item.Id}`)
                }
            }
        };
        return {
            success: succes,
            echec: echec
        };
    }

    public async saveMovieDontSave(): Promise<any> {
        const movies: Node[] = await this.getMoviesInJellyfinNotSaveIntoChocoPlusData();
        const succes: any[] = [];
        const echec: any[] = [];
        for (const movie of movies) {
            try {
                if (typeof movie.id === 'string') {
                    const result: EditMovie = await this.tmdbService.searchMovieByJellyfinId(movie.id);
                    const message: ReturnMessage = await this.movieService.insertNewMovie(result, false);
                    if (message.state) {
                        console.log("success : " + result.title);
                        succes.push(result.title);
                    } else {
                        console.log("echec : " + result.title);
                        echec.push(result.title);
                    }
                }
            } catch (error) {
                console.log("échec Id : " + movie.name + ' ___ ' + movie.id);
                echec.push(`${movie.name} ____ ${movie.id}`)
            }
        }
        return {
            success: succes,
            echec: echec
        };
    }

    public async saveSeriesDontSave(): Promise<any> {
        const series: Node[] = await this.getSeriesInJellyfinNotSaveIntoCHocoPlusData();
        const succes: any[] = [];
        const echec: any[] = [];
        for (const serie of series) {
            try {
                if (typeof serie.id === 'string') {
                    const result: EditSeries = await this.tmdbService.searchSeriesByJellyfinId(serie.id);
                    const message: ReturnMessage = await this.seriesService.insertNewSeries(result, false);
                    if (message.state) {
                        console.log("success : " + result.title);
                        succes.push(result.title);
                    } else {
                        console.log("echec : " + result.title);
                        echec.push(result.title);
                    }
                }
            } catch (error) {
                console.log("échec Id : " + serie.name + ' ___ ' + serie.id);
                echec.push(`${serie.name} ____ ${serie.id}`)
            }
        }
        return {
            success: succes,
            echec: echec
        };
    }

    public async getJellyfinItemsMediaDontLinkedWithTmdbMetaData(): Promise<{ movies: Node[], series: Node[] }> {
        const nodeMovies: Node[] = [];
        await this.setAllJellyfinItemsMovie();
        this.allJellyfinItemsMovie.forEach((item: any) => {
            if (!item.ProviderIds.Tmdb) {
                nodeMovies.push({
                    id: item.Id,
                    name: item.Name
                })
            }
        });
        const nodeSeries: Node[] = [];
        await this.setAllJellyfinItemsSeries();
        this.allJellyfinItemsSeries.forEach((item: any) => {
            if (!item.ProviderIds.Tmdb) {
                nodeSeries.push({
                    id: item.Id,
                    name: item.Name
                })
            }
        });
        return {
            movies: nodeMovies,
            series: nodeSeries
        }
    }

    public async getMoviesInJellyfinNotSaveIntoChocoPlusData(): Promise<Node[]> {
        await this.setAllJellyfinItemsMovie();
        const movies: Media[] = await this.movieService.getAllMediaIdByType();
        const movieNotSaved: any[] = this.allJellyfinItemsMovie.filter((item: any) => !movies.some((movie: Media) => movie.jellyfinId === item.Id));
        const moviesFormated: Node[] = [];
        movieNotSaved.forEach((item: any) => {
            if (item.ProviderIds.Tmdb) {
                moviesFormated.push({
                    id: item.Id,
                    name: item.Name,
                })
            }
        })
        return moviesFormated;
    }

    public async getSeriesInJellyfinNotSaveIntoCHocoPlusData(): Promise<Node[]> {
        await this.setAllJellyfinItemsSeries();
        const series: Media[] = await this.seriesService.getAllMediaIdByType();
        const seriesWanted: any[] = this.allJellyfinItemsSeries.filter((item: any) => !series.some((series: Media) => series.jellyfinId === item.Id));
        const seriesFormated: Node[] = [];
        seriesWanted.forEach((item: any) => {
            if (item.ProviderIds.Tmdb) {
                seriesFormated.push({
                    id: item.Id,
                    name: item.Name,
                })
            }
        })
        return seriesFormated;
    }

    public async getMediaWithAnyJellyfinIdWorking(): Promise<{ movies: Node[], series: Node[] }> {
        const movies: Media[] = await this.movieService.getAllMediaIdByType();
        const nodeMovies: Node[] = [];
        await this.setAllJellyfinItemsMovie();
        movies.forEach((movie: Media) => {
            const itemJelly: any | null = this.allJellyfinItemsMovie.find((item: any) => item.Id === movie.jellyfinId);
            if (!itemJelly) {
                nodeMovies.push({
                    id: movie.id,
                    name: movie.title
                });
            }
        });
        const series: Media[] = await this.seriesService.getAllMediaIdByType();
        const nodeSeries: Node[] = [];
        await this.setAllJellyfinItemsSeries();
        series.forEach((serie: Media) => {
            const itemJelly: any | null = this.allJellyfinItemsSeries.find((item: any) => item.Id === serie.jellyfinId);
            if (!itemJelly) {
                nodeSeries.push({
                    id: serie.id,
                    name: serie.title
                });
            }
        });
        return {
            movies: nodeMovies,
            series: nodeSeries
        }
    }

    public async getMovieItemenWithAudioMoreThanTwo(): Promise<any[]> {
        await this.setAllJellyfinItemsMovie();
        const result: any[] = [];
        for (const movie of this.allJellyfinItemsMovie) {
            const audio: any[] = movie.MediaStreams.filter((item) => item.Type === 'Audio');
            if (audio.length > 2) {
                result.push(movie.Name);
            }
        }
        return result;
    }

    public async getStreamVideoByItemId(jellyfinId: string): Promise<any> {
        try {
            const url: string = `${this.httpPort}/${this.urlItmes}/${jellyfinId}/PlaybackInfo?${this.apiKey}`;
            const response = await lastValueFrom(this.httpService.get(url));
            return response.data;
        } catch (error) {
            return null;
        }
    }

}
