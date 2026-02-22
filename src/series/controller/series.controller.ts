import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { SeriesService } from '../service/series.service';
import { Series } from '../dto/series.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditSeries } from '../dto/edit-series.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Episode } from '../dto/episode.interface';
import { Node } from 'src/common-interface/node.interface';
import { CurrentUser } from 'src/guard/current-user.guard';
import { StatState } from 'src/stat-user/dto/stat-state.enum';

@Controller('series')
export class SeriesController {

    constructor(private seriesService: SeriesService) { }

    @Get('nodes')
    async getNodesSeries(): Promise<Node[]> {
        return await this.seriesService.getNodesSeries();
    }

    @Get('research/:keyWord')
    async getMovieByResearch(@Param('keyWord') keyWord: string): Promise<Series[]> {
        return await this.seriesService.getSeriesByResearch(keyWord);
    }

    @Get('episodes/:idSeries/:idSeason')
    async getEpisodesBySeriesAndSeasonId(@CurrentUser('sub') userId: number, @Param('idSeries', ParseIntPipe) idSeries: number, @Param('idSeason', ParseIntPipe) idSeason: number): Promise<Episode[]> {
        return await this.seriesService.getEpisodesBySeriesAndSeasonId(userId, idSeries, idSeason);
    }

    @Get('random-series')
    async getRandomSeries(): Promise<Series> {
        return await this.seriesService.getRandomSeries();
    }

    @Get('first-episode/:seriesId')
    async getFirstEpisodeBySeason(@Param('seriesId') seriesId: number): Promise<Episode> {
        return await this.seriesService.getFirstEpisodeBySeason(seriesId);
    }

    @Get('last-episode-watched/:seriesId')
    async getLastWatchedEpisode(@CurrentUser('sub') userId: number, @Param('seriesId') seriesId: number): Promise<Episode> {
        return await this.seriesService.getLastWatchedEpisode(userId, seriesId);
    }

    @Get('watchProgress/:episodeId')
    async getWatchProgressByEpisodeId(@CurrentUser('sub') userId: number, @Param('episodeId', ParseIntPipe) episodeId: number): Promise<{ watchProgress: number, state: StatState}> {
        return await this.seriesService.getWatchProgressByEpisodeId(userId, episodeId);
    }

    @Get(':id')
    async getSeriesById(@Param('id', ParseIntPipe) id: number): Promise<Series> {
        return await this.seriesService.getSeriesById(id);
    }

    @UseGuards(AdminUserGuard)
    @Post('add')
    async addData(@Body() newData: EditSeries): Promise<ReturnMessage> {
        return await this.seriesService.insertNewSeries(newData, true);
    }

    @UseGuards(AdminUserGuard)
    @Put('modify')
    async modify(@Body() modifyData: EditSeries): Promise<ReturnMessage> {
        return await this.seriesService.updateSeries(modifyData);
    }

    @UseGuards(AdminUserGuard)
    @Delete('delete/:id')
    async deleteData(@Param('id', ParseIntPipe) id: number): Promise<ReturnMessage> {
        return await this.seriesService.deleteSeriesById(id);
    }

}
