import { Controller, Get, Param, UseGuards, Query, ParseBoolPipe, ParseIntPipe } from '@nestjs/common';
import { Media } from '../dto/media.interface';
import { MediaService } from '../service/media.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from '../dto/media-type.enum';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';
import { CurrentUser } from 'src/guard/current-user.guard';
import { SortCatalog } from '../dto/sort-catalog.enum';

@Controller('media')
export class MediaController {

    constructor(private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService
    ) { }

    @Get('research/:keyword')
    async getMediaByResearch(@CurrentUser('sub') userId: number, @Param('keyword') keyword: string): Promise<Media[]> {
        const medias: Media[] = [];
        const items: any[] = await this.mediaService.getMoviesAndSeriesByResearch(userId, keyword);
        items.forEach((item: any) => {
            if (item.media.mediaType === MediaType.MOVIE) {
                medias.push(this.movieService.getFormatedMovie(item));
            } else if (item.media.mediaType === MediaType.SERIES) {
                medias.push(this.seriesService.getFormatedSeries(item));
            }
        });
        return medias;
    }

    @Get('catalog')
    async getMediaByCatalogFilters(
        @CurrentUser('sub') userId: number,
        @Query('decadeFilter') decadeFilter: string,
        @Query('categoryFilter') categoryFilter: string,
        @Query('mediaTypeFilter') mediaTypeFilter: MediaType,
        @Query('sortFilter') sortFilter: SortCatalog,
        @Query('orderDirection') orderDirection: string,
        @Query('count') count: string,
        @Query('offset') offset: string,
    ) {
        const medias: Media[] = [];
        const items: any[] = await this.mediaService.getMediaByCatalogFilters(
            userId,
            decadeFilter ? Number(decadeFilter) : null,
            categoryFilter ? Number(categoryFilter) : null,
            mediaTypeFilter ?? null,
            sortFilter ?? SortCatalog.SHUFFLE,
            orderDirection != null && orderDirection === 'false' ? false : true,
            count ? Number(count) : 50,
            offset ? Number(offset) : 0,
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
        return await this.mediaService.getMediaInfoById(mediaId);
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
