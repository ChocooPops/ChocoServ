import { Controller, Body, UseGuards, Get, Put } from '@nestjs/common';
import { NewsService } from '../service/news.service';
import { News } from '../dto/news.interface';
import { EditNews } from '../dto/edit-news.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';

@Controller('news')
export class NewsController {

    constructor(private newsService: NewsService) { }

    @Get()
    async getAllNews(): Promise<News[]> {
        return await this.newsService.getAllNews();
    }

    @UseGuards(AdminUserGuard)
    @Put()
    async modifyNews(@Body() updatedNews: EditNews[]): Promise<ReturnMessage> {
        return await this.newsService.updateNews(updatedNews);
    }

}
