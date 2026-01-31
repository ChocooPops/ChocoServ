import { Controller, Get, UseGuards, Put, Post } from '@nestjs/common';
import { JellyfinService } from '../service/jellyfin.service';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';

@Controller('jellyfin')
export class JellyfinController {

    constructor(private readonly jellyfinService: JellyfinService) { }

    @UseGuards(AdminUserGuard)
    @Get('reset-jellyfin-items-movie')
    async resetAllJellyfinIntemsMovie(): Promise<any> {
        return await this.jellyfinService.resetAllJellyfinItemsMovie();
    }

    @UseGuards(AdminUserGuard)
    @Get('reset-jellyfin-items-series')
    async resetAllJellyfinItemsSeries(): Promise<any> {
        return await this.jellyfinService.resetAllJellyfinItemsSeries();
    }

    @UseGuards(AdminUserGuard)
    @Put('reset-all-movies')
    async resetAllMovies(): Promise<any> {
        return await this.jellyfinService.resetAllMovies();
    }

    @UseGuards(AdminUserGuard)
    @Put('reset-all-series')
    async resetAllSeries(): Promise<any> {
        return await this.jellyfinService.resetAllSeries();
    }

    @UseGuards(AdminUserGuard)
    @Post('save-movie-dont-saved')
    async saveMovieDontSave(): Promise<any> {
        return await this.jellyfinService.saveMovieDontSave();
    }

    @UseGuards(AdminUserGuard)
    @Post('save-series-dont-saved')
    async saveSeriesDontSave(): Promise<any> {
        return await this.jellyfinService.saveSeriesDontSave();
    }

    @UseGuards(AdminUserGuard)
    @Get('miss-metadata-tmdb')
    public async getJellyfinItemsDontLinkedWithTmdbMetaData(): Promise<{ movies: Node[], series: Node[] }> {
        const nodes = await this.jellyfinService.getJellyfinItemsMediaDontLinkedWithTmdbMetaData();
        return nodes;
    }

    @UseGuards(AdminUserGuard)
    @Get('media-not-saved')
    async getMediaInJellyfinNotSaveIntoChocoPlusData(): Promise<{ movies: Node[], series: Node[] }> {
        const movies: Node[] = await this.jellyfinService.getMoviesInJellyfinNotSaveIntoChocoPlusData();
        const series: Node[] = await this.jellyfinService.getSeriesInJellyfinNotSaveIntoCHocoPlusData();
        return {
            movies: movies,
            series: series,
        }
    }

    @UseGuards(AdminUserGuard)
    @Get('jellyfinId-dont-exist')
    async getMovieWithAnyJellyfinIdWorking(): Promise<{ movies: Node[], series: Node[] }> {
        const nodes = await this.jellyfinService.getMediaWithAnyJellyfinIdWorking();
        return nodes;
    }

    @UseGuards(AdminUserGuard)
    @Get('audio-more')
    async getMovieItemenWithAudioMoreThanTwo(): Promise<any[]> {
        return await this.jellyfinService.getMovieItemenWithAudioMoreThanTwo();
    }

}
