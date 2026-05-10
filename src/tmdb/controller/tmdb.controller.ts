import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TmdbService } from '../service/tmdb.service';
import { EditMovie } from 'src/movie/dto/edit-movie.interface';
import { Credit } from 'src/credit/dto/credit.interface';

@Controller('tmdb')
export class TmdbController {

    constructor(private readonly tmdbService: TmdbService) { }

    @Get('search-movie-tmdb/:movie')
    async searchMovieByTitleOrTmdbId(@Param('movie') movie: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(movie);
        if (isNumeric) {
            return await this.tmdbService.searchMovieByTmdbId(Number(movie), null);
        } else {
            return await this.tmdbService.searchMoviebByTitle(movie);
        }
    }
    @Get('search-movie-library/:mediaLibraryId')
    async searchMovieByMediaLibraryId(@Param('mediaLibraryId') mediaLibraryId: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(mediaLibraryId);
        if (isNumeric) {
            return await this.tmdbService.searchMovieByTmdbId(Number(mediaLibraryId), null);
        } else {
            return await this.tmdbService.searchMovieByMediaLibraryId(mediaLibraryId);
        }
    }

    @Get('search-series-tmdb/:series')
    async searchSeriesByTitleOrTmdbId(@Param('series') series: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(series);
        if (isNumeric) {
            return await this.tmdbService.searchSeriesByTmdbId(Number(series), null);
        } else {
            return await this.tmdbService.searchSeriesByTitle(series);
        }
    }
    @Get('search-series-library/:mediaLibraryId')
    async searchSeriesByMediaLibraryId(@Param('mediaLibraryId') series: string): Promise<EditMovie> {
        const isNumeric = /^\d+$/.test(series);
        if (isNumeric) {
            return await this.tmdbService.searchSeriesByTmdbId(Number(series), null);
        } else {
            return await this.tmdbService.searchSeriesByMediaLibraryId(series);
        }
    }


    @Get('search-credit-by-id/:id')
    async searchCreditByTmdbId(@Param('id', ParseIntPipe) id: number): Promise<Credit> {
        return await this.tmdbService.searchCreditByTmdbId(id);
    }

    @Get('search-credit-by-full-name/:name')
    async searchCreditByFullName(@Param('name') name: string): Promise<Credit> {
        return await this.tmdbService.searchCreditByFullName(name);
    }

}
