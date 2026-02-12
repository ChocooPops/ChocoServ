import { Controller, Get, Param, ParseIntPipe, Res, Req, Query } from '@nestjs/common';
import { StreamService } from '../service/stream.service';
import { Response, Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/guard/public.decorator';
import { JwtService } from '@nestjs/jwt';

@Controller('stream')
export class StreamController {

    constructor(private readonly streamService: StreamService,
        private readonly authService: AuthService,
        private readonly jwtService: JwtService
    ) { }

    @Public()
    @Get('stream-movie/:movieId')
    async streamMovie(
        @Param('movieId', ParseIntPipe) movieId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                const payload = this.jwtService.verify(token);
                await this.streamService.streamMovie(payload.sub, movieId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }

    @Public()
    @Get('stream-episode/:seasonId/:episodeId')
    async streamEpisode(
        @Param('seasonId', ParseIntPipe) seasonId: number,
        @Param('episodeId', ParseIntPipe) episodeId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                const payload = this.jwtService.verify(token);
                await this.streamService.streamEpisode(payload.userId, seasonId, episodeId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }

    @Public()
    @Get('stream-news/:newsId')
    async streamNewVideoRunning(
        @Param('newsId', ParseIntPipe) newsId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                await this.streamService.streamNewVideoRunning(newsId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }
}
