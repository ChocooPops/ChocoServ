import { Controller, UseGuards, Get, Put, Param, ParseIntPipe } from '@nestjs/common';
import { SimilarTitleService } from '../service/similar-title.service';
import { Media } from 'src/media/dto/media.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { SimilarTitle } from '../dto/similar-title.interface';
import { Link } from 'src/common-interface/link.interface';
import { Node } from 'src/common-interface/node.interface';

@Controller('similar-title')
export class SimilarTitleController {

    constructor(private similarTitleService: SimilarTitleService) { }

    @Get('links')
    async getLinksSimilarTitle(): Promise<Link[]> {
        return await this.similarTitleService.getLinksSimilarTitle();
    }

    @UseGuards(AdminUserGuard)
    @Get('movie-with-less-similar-titles')
    async getAllMovieWhichHasLessThanMaxSimilarTitles(): Promise<{ movies: Node[], series: Node[] }> {
        return await this.similarTitleService.getAllMediaWhichHasLessThanMaxSimilarTitles();
    }

    @Get('links')
    async getLinksBetweenSimilarTitle(): Promise<any[]> {
        return await this.similarTitleService.getLinksBetweenSimilarTitle();
    }

    @Get(':id')
    async getAllSimilarTitlesForOneMovieById(@Param('id', ParseIntPipe) id: number): Promise<Media[]> {
        return this.similarTitleService.getAllSimilarTitlesForOneMediaByIdAndType(id);
    }

    @UseGuards(AdminUserGuard)
    @Put('rewrite-all-data')
    async rewriteAllDataAboutSimilarTitles(): Promise<SimilarTitle[]> {
        return await this.similarTitleService.rewriteAllSimilarTitle();
    }

}
