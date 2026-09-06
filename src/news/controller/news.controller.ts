import { Controller, Body, UseGuards, Get, Put, Query } from '@nestjs/common';
import { NewsService } from '../service/news.service';
import { News } from '../dto/news.interface';
import { EditNews } from '../dto/edit-news.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { CurrentUser } from 'src/guard/current-user.guard';

@Controller('news')
export class NewsController {

    constructor(private readonly newsService: NewsService) { }

    @Get()
    async getAllNews(
        @CurrentUser('sub') userId: number, 
        @Query('setOrder') setOrder: any
    ): Promise<News[]> {
        return await this.newsService.getAllNews(userId, setOrder);
    }

    @UseGuards(AdminUserGuard)
    @Put()
    async modifyNews(
        @Body('updatedNews') updatedNews: EditNews[], 
        @Body('isOrderRandom') isOrderRandom : boolean
    ): Promise<ReturnMessage> {
        return await this.newsService.updateNews(updatedNews, isOrderRandom);
    }

}
