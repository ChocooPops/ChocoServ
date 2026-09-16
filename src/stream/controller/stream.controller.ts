import { Controller, Get, Param, ParseIntPipe, Res, Req, Query, UseGuards } from '@nestjs/common';
import { StreamService } from '../service/stream.service';
import { Response, Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/guard/public.decorator';
import { JwtService } from '@nestjs/jwt';
import { FamilyUserGuard } from 'src/guard/family-user.guard';

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
                await this.streamService.streamEpisode(payload.sub, seasonId, episodeId, req, res);
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

    @UseGuards(FamilyUserGuard)
    @Get('download-movie/:movieId')
    async downloadMovie(
        @Param('movieId', ParseIntPipe) movieId: number,
        @Res() res: Response
    ) {
        try {
            await this.streamService.downloadMovie(movieId, res);
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
            await this.streamService.downloadEpisode(episodeId, res);
        } catch (error) {
            throw error;
        }
    }
}
