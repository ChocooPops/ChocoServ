import { Controller, Get, Param } from '@nestjs/common';
import { TmdbService } from '../service/tmdb.service';
import { EditMovie } from 'src/movie/dto/edit-movie.interface';

@Controller('tmdb')
export class TmdbController {

    constructor(private tmdbService: TmdbService) { }

    @Get('search-movie-tmdb/:movie')
    async searchMovieByTitleOrTmdbId(@Param('movie') movie: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(movie);
        if (isNumeric) {
            return await this.tmdbService.searchMovieByTmdbId(Number(movie));
        } else {
            return await this.tmdbService.searchMoviebByTitle(movie);
        }
    }

    @Get('search-series-tmdb/:series')
    async searchSeriesByTitleOrTmdbId(@Param('series') series: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(series);
        if (isNumeric) {
            return await this.tmdbService.searchSeriesByTmdbId(Number(series));
        } else {
            return await this.tmdbService.searchSeriesByTitle(series);
        }
    }

    @Get('search-movie-jellyfin/:id')
    async searchMovieByJellyfinId(@Param('id') id: string): Promise<EditMovie> {
        return await this.tmdbService.searchMovieByJellyfinId(id);
    }

    @Get('search-series-jellyfin/:id')
    async searchSeriesByJellyfinId(@Param('id') id: string): Promise<EditMovie> {
        return await this.tmdbService.searchSeriesByJellyfinId(id);
    }

}
