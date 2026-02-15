import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Media } from '../dto/media.interface';
import { MediaService } from '../service/media.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from '../dto/media-type.enum';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';
import { CurrentUser } from 'src/guard/current-user.guard';

@Controller('media')
export class MediaController {

    constructor(private mediaService: MediaService,
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

    @UseGuards(AdminUserGuard)
    @Get('null-poster')
    async getMediaWithNullPoster(): Promise<{ movies: Node[], series: Node[] }> {
        return await this.mediaService.getMediaWithNullPoster();
    }

    @UseGuards(AdminUserGuard)
    @Get('path-dont-exist')
    async getMediaWithPathDontExist(): Promise<{ movies: Node[], series: Node[] }> {
        return {
            movies : await this.movieService.getNodesMoviePathDontExist(),
            series : await this.seriesService.getNodesEpisodePathDontExist()
        }
    }

}
