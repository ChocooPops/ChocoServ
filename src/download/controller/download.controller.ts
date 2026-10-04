import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import { DownloadService } from '../service/download.service';
import { Response } from 'express';
import { FamilyUserGuard } from 'src/guard/family-user.guard';

@Controller('download')
export class DownloadController {

    constructor(private readonly downloadService: DownloadService) { }

    @UseGuards(FamilyUserGuard)
    @Get('download-movie/:movieId')
    async downloadMovie(
        @Param('movieId', ParseIntPipe) movieId: number,
        @Res() res: Response
    ) {
        try {
            await this.downloadService.downloadMovie(movieId, res);
        } catch (error) {
            throw error;
        }
    }

    @UseGuards(FamilyUserGuard)
    @Get('download-episode/:episodeId')
    async downloadEpisode(
        @Param('episodeId', ParseIntPipe) episodeId: number,
        @Res() res: Response
    ) {
        try {
            await this.downloadService.downloadEpisode(episodeId, res);
        } catch (error) {
            throw error;
        }
    }

}
