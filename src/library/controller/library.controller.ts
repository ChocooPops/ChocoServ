import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { LibraryService } from '../service/library.service';
import { Library } from '../dto/library.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { MediaLibrary } from '../dto/media-library.interface';

@Controller('library')
export class LibraryController {

    constructor(private readonly libraryService: LibraryService) { }

    @UseGuards(AdminUserGuard)
    @Get('libraries')
    async getAllLibrary(): Promise<Library[]> {
        return this.libraryService.getAllLibrary();
    }

    @UseGuards(AdminUserGuard)
    @Get('media-libraries/:libraryId')
    async getAllMediaLibraryByLibraryId(@Param('libraryId') libraryId: string): Promise<MediaLibrary[]> {
        return await this.libraryService.getAllMediaLibraryByLibraryId(libraryId)
    }

    @UseGuards(AdminUserGuard)
    @Post()
    async addNewLibrary(@Body() library: Library): Promise<ReturnMessage> {
        return await this.libraryService.insertNewLibrary(library);
    } 

    @UseGuards(AdminUserGuard)
    @Put('refresh/:id')
    async refreshLibrary(@Param('id') id: string): Promise<any> {
        return await this.libraryService.refreshLibrary(id);
    }

    @UseGuards(AdminUserGuard)
    @Delete(':id')
    async deleteLibraryById(@Param('id') id: string): Promise<ReturnMessage> {
        return await this.libraryService.deleteLibraryById(id);
    }

}
