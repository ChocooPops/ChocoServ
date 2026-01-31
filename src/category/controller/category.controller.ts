import { Controller, Get, Post, Put, Body, ParseIntPipe, Param, Delete, UseGuards } from '@nestjs/common';
import { AdminUserGuard } from "src/guard/admin-user.guard";
import { CategoryService } from '../service/category.service';
import { CategoryEntirely } from '../dto/categoryEntirely.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { Category } from '../dto/category.interface';
import { CategorySimple } from '../dto/categorySimple.interface';
import { Graph } from 'src/common-interface/graph.intrface';

@Controller('category')
export class CategoryController {

    constructor(private categoryService: CategoryService) { }

    @Get('graph')
    public async getGraphCategory(): Promise<Graph> {
        return await this.categoryService.getGraphCategory();
    }

    @Get('all-categories')
    async getAllCategories(): Promise<CategorySimple[]> {
        return this.categoryService.getAllCategories();
    }

    @Get(':id')
    async getCategoryById(@Param('id', ParseIntPipe) id: number): Promise<CategoryEntirely> {
        return await this.categoryService.getCategoryById(id)
    }

    @UseGuards(AdminUserGuard)
    @Post('save-category')
    async saveNewCategory(@Body() category: Category): Promise<ReturnMessage> {
        return await this.categoryService.insertNewCategory(category);
    }

    @UseGuards(AdminUserGuard)
    @Put('update-category')
    async modifyMoviesIntoCategory(@Body() categoryUpdated: Category): Promise<ReturnMessage> {
        return await this.categoryService.updateCategoryById(categoryUpdated);
    }

    @UseGuards(AdminUserGuard)
    @Delete(':id')
    async deleteCategoryById(@Param('id', ParseIntPipe) id: number): Promise<ReturnMessage> {
        return await this.categoryService.deleteCategory(id);
    }

}
