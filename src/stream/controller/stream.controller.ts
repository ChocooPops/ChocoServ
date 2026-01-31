import { Controller, Get, Param, ParseIntPipe, Res, Req, Query } from '@nestjs/common';
import { StreamService } from '../service/stream.service';
import { Response, Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { Public } from 'src/guard/public.decorator';

@Controller('stream')
export class StreamController {

    constructor(private readonly streamService: StreamService,
        private readonly authService: AuthService
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
                await this.streamService.streamMovie(movieId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }

    @Public()
    @Get('stream-episode/:episodeId')
    async streamEpisode(
        @Param('episodeId', ParseIntPipe) episodeId: number,
        @Req() req: Request,
        @Res() res: Response,
        @Query('token') token: string,
    ) {
        try {
            if (await this.authService.verifToken(token)) {
                await this.streamService.streamEpisode(episodeId, req, res);
            }
        } catch (error) {
            throw error;
        }
    }
}
