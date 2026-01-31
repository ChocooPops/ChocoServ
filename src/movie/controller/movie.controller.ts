import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { MovieService } from '../service/movie.service';
import { Movie } from '../dto/movie.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditMovie } from '../dto/edit-movie.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { Node } from 'src/common-interface/node.interface';

@Controller('movie')
export class MovieController {

    constructor(private movieService: MovieService) { };

    @Get('nodes')
    async getNodesMovie(): Promise<Node[]> {
        return await this.movieService.getNodesMovie();
    }

    @Get('research/:keyWord')
    async getMovieByResearch(@Param('keyWord') keyWord: string): Promise<Movie[]> {
        return await this.movieService.getMovieByResearch(keyWord);
    }

    @Get('random-movie')
    async getRandomMovie(): Promise<Movie> {
        return await this.movieService.getRandomMovie();
    }

    @Get(':id')
    async getMovieById(@Param('id', ParseIntPipe) id: number): Promise<Movie> {
        return await this.movieService.getMovieById(id);
    }

    @UseGuards(AdminUserGuard)
    @Post('add')
    async addData(@Body() newData: EditMovie): Promise<ReturnMessage> {
        return await this.movieService.insertNewMovie(newData, true);
    }

    @UseGuards(AdminUserGuard)
    @Put('modify')
    async updateData(@Body() updatedData: EditMovie): Promise<ReturnMessage> {
        return await this.movieService.updateMovie(updatedData);
    }

    @UseGuards(AdminUserGuard)
    @Delete('delete/:id')
    async deleteData(@Param('id', ParseIntPipe) id: number): Promise<ReturnMessage> {
        return await this.movieService.deleteMovieById(id);
    }

}
