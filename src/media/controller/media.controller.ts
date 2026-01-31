import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Media } from '../dto/media.interface';
import { MediaService } from '../service/media.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from '../dto/media-type.enum';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';

@Controller('media')
export class MediaController {

    constructor(private mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService
    ) { }

    @Get('research/:keyword')
    async getMediaByResearch(@Param('keyword') keyword: string): Promise<Media[]> {
        const medias: Media[] = [];
        const items: any[] = await this.mediaService.getMoviesAndSeriesByResearch(keyword);
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

}
