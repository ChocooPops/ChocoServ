import { Controller, Get, Post, Put, Delete, ParseIntPipe, Param, UseGuards, Body } from '@nestjs/common';
import { SelectionService } from '../service/selection.service';
import { Selection } from '../dto/selection.interface';
import { EditSelection } from '../dto/edit-selection.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Graph } from 'src/common-interface/graph.intrface';
import { PageType } from '../dto/page-type.enum';
import { CurrentUser } from 'src/guard/current-user.guard';

@Controller('selection')
export class SelectionController {

    constructor(private selectionService: SelectionService) { };

    @Get('graph')
    async getGraphSelection(): Promise<Graph> {
        return this.selectionService.getGraphSelection();
    }

    @Get('selection-home')
    async getRandomSelectionsForHome(@CurrentUser('sub') userId: number): Promise<Selection[]> {
        return await this.selectionService.getSelectionsForHomePage(userId);
    }

    @Get('random-media-selection-by-type/:mediaType')
    async getRandomMovieSelections(@CurrentUser('sub') userId: number, @Param('mediaType') mediaType: MediaType): Promise<Selection[]> {
        return await this.selectionService.createMediaSelectionsByTypeFromCategoryByCount(userId, mediaType);
    }

    @Get('research/:keyWord')
    async getSelectionByResearch(@Param('keyWord') keyWord: string): Promise<Selection[]> {
        return await this.selectionService.getSelectionByResearched(keyWord);
    }

    @Get(':id')
    async getSelectionById(@Param('id', ParseIntPipe) id: number): Promise<Selection> {
        return await this.selectionService.getSelectionById(id);
    }

    @UseGuards(AdminUserGuard)
    @Post('add')
    async addData(@Body() newSelection: EditSelection): Promise<ReturnMessage> {
        return await this.selectionService.insertNewSelection(newSelection);
    }

    @UseGuards(AdminUserGuard)
    @Put('modify')
    async updateData(@Body() updatedSelection: EditSelection): Promise<ReturnMessage> {
        return await this.selectionService.updateSelection(updatedSelection);
    }

    @UseGuards(AdminUserGuard)
    @Put('update-selection-page-home')
    async updateSelectionIntoHomePage(@Body() selectionIds: number[]): Promise<ReturnMessage> {
        return await this.selectionService.updateSelectionByPageType(selectionIds, PageType.HOME);
    }

    @UseGuards(AdminUserGuard)
    @Delete('delete/:id')
    async deleteData(@Param('id', ParseIntPipe) id: number): Promise<ReturnMessage> {
        return await this.selectionService.deleteSelectionById(id);
    }

}
