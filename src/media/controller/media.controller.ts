import { Controller, Get, Param, UseGuards, Query, ParseIntPipe, Body, Post } from '@nestjs/common';
import { Media } from '../dto/media.interface';
import { MediaService } from '../service/media.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from '../dto/media-type.enum';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';
import { CurrentUser } from 'src/guard/current-user.guard';
import { FILTERS } from '../dto/catalog/filters.interface';
import { SortCatalog } from '../dto/catalog/sort-catalog.enum';
import { MediaSubstitutionSerivce } from '../service/media-substitution.service';

@Controller('media')
export class MediaController {

    constructor(private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly mediaSubstitutionSerivce: MediaSubstitutionSerivce
    ) { }

    @Get('research/:keyword')
    async getMediaByResearch(@CurrentUser('sub') userId: number, @Param('keyword') keyword: string): Promise<Media[]> {
        const medias: Media[] = [];
        const items: any[] = await this.mediaSubstitutionSerivce.getMoviesAndSeriesByResearch(userId, keyword);
        items.forEach((item: any) => {
            if (item.media.mediaType === MediaType.MOVIE) {
                medias.push(this.movieService.getFormatedMovie(item));
            } else if (item.media.mediaType === MediaType.SERIES) {
                medias.push(this.seriesService.getFormatedSeries(item));
            }
        });
        return medias;
    }

    @Post('catalog')
    async getMediaByCatalogFilters(
        @CurrentUser('sub') userId: number,
        @Query('sortFilter') sortFilter: SortCatalog,
        @Query('orderDirection') orderDirection: string,
        @Query('count') count: string,
        @Query('offset') offset: string,
        @Body() filters: FILTERS[]
    ) {
        const medias: Media[] = [];
        const items: any[] = await this.mediaSubstitutionSerivce.getMediaByCatalogFilters(
            userId,
            sortFilter ?? SortCatalog.SHUFFLE,
            orderDirection !== 'false',
            count ? Number(count) : 50,
            offset ? Number(offset) : 0,
            filters ?? []
        );
        items.forEach((item: any) => {
            if (item.media.mediaType === MediaType.MOVIE) {
                medias.push(this.movieService.getFormatedMovie(item));
            } else if (item.media.mediaType === MediaType.SERIES) {
                medias.push(this.seriesService.getFormatedSeries(item));
            }
        });
        return medias;
    }

    @Get('media-info/:mediaId')
    async getMediaInfoById(@Param('mediaId', ParseIntPipe) mediaId: number): Promise<any> {
        return await this.mediaSubstitutionSerivce.getMediaInfoById(mediaId);
    }

    @UseGuards(AdminUserGuard)
    @Get('null-poster')
    async getMediaWithNullPoster(): Promise<{ movies: Node[], series: Node[] }> {
        return await this.mediaService.getMediaWithNullPoster();
    }

    @UseGuards(AdminUserGuard)
    @Get('path-dont-exist')
    async getMediaWithPathDontExist(): Promise<{ movies: Node[], series: Node[] }> {
        return {
            movies: await this.movieService.getNodesMoviePathDontExist(),
            series: await this.seriesService.getNodesEpisodePathDontExist()
        }
    }

}
