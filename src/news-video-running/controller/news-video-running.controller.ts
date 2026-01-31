import { Controller, Get, Put, UseGuards, Body } from '@nestjs/common';
import { NewsVideoRunning } from '../dto/news-video-running.interface';
import { EditNewsVideoRunning } from '../dto/edit-news-video-running.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { AdminUserGuard } from "src/guard/admin-user.guard";
import { NewsVideoRunningService } from '../service/news-video-running.service';
import { MediaType } from 'src/media/dto/media-type.enum';

@Controller('news-video-running')
export class NewsVideoRunningController {

    constructor(private newsVideoRunningService: NewsVideoRunningService) { }

    @Get('movies')
    async getRandomNewsMovieRunning(): Promise<NewsVideoRunning> {
        return await this.newsVideoRunningService.getRandomNewsMovieRunning();
    }

    @Get('series')
    async getRandomSeriesRunning(): Promise<NewsVideoRunning> {
        return await this.newsVideoRunningService.getRandomSeriesRunning();
    }

    @Get('all-movies')
    async getAllNewsMovieRunning(): Promise<NewsVideoRunning[]> {
        return await this.newsVideoRunningService.getAllNewsMovieRunning();
    }

    @Get('all-series')
    async getAllNewsSeriesRunning(): Promise<NewsVideoRunning[]> {
        return await this.newsVideoRunningService.getAllNewsSeriesRunning();
    }

    @UseGuards(AdminUserGuard)
    @Put('movies')
    async modifyNewsMovieRunning(@Body() newsUpdate: EditNewsVideoRunning[]): Promise<ReturnMessage> {
        return await this.newsVideoRunningService.updateNewsVideoRunning(newsUpdate, MediaType.MOVIE);
    }

    @UseGuards(AdminUserGuard)
    @Put('series')
    async modifyNewsSeriesRunning(@Body() newsUpdate: EditNewsVideoRunning[]): Promise<ReturnMessage> {
        return await this.newsVideoRunningService.updateNewsVideoRunning(newsUpdate,  MediaType.SERIES);
    }

}
