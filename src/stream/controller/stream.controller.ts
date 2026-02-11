import { Controller, Get, Param, ParseIntPipe, Res, Req, Query } from '@nestjs/common';
import { StreamService } from '../service/stream.service';
import { Response, Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/guard/public.decorator';
import { CurrentUser } from 'src/guard/current-user.guard';

@Controller('stream')
export class StreamController {

    constructor(private readonly streamService: StreamService,
        private readonly authService: AuthService
    ) { }

    @Public()
    @Get('stream-movie/:movieId')
    async streamMovie(
        @CurrentUser('sub') userId: number,
        @Param('movieId', ParseIntPipe) movieId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                await this.streamService.streamMovie(userId, movieId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }

    @Public()
    @Get('stream-episode/:seasonId/:episodeId')
    async streamEpisode(
        @CurrentUser('sub') userId: number,
        @Param('seasonId', ParseIntPipe) seasonId: number,
        @Param('episodeId', ParseIntPipe) episodeId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                await this.streamService.streamEpisode(userId, seasonId, episodeId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }

    @Public()
    @Get('stream-news/:newsId')
    async streamNewVideoRunning(
        @CurrentUser('sub') userId: number,
        @Param('newsId', ParseIntPipe) newsId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                await this.streamService.streamNewVideoRunning(userId, newsId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }
}
