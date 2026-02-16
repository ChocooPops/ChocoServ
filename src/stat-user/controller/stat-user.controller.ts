import { Controller, ParseIntPipe, Param, Query, Get } from '@nestjs/common';
import { UserCategoryPreferences } from '../dto/user-category-preferences.interface';
import { StatUserService } from '../service/stat-user.service';
import { CurrentUser } from 'src/guard/current-user.guard';
import { WatchTimeStats } from '../dto/watch-time-stats.interface';

@Controller('stat-user')
export class StatUserController {
  constructor(private statUserService: StatUserService) {}

  @Get(':userId/categories/preferences')
  async getPreferredCategories(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ): Promise<UserCategoryPreferences> {
    return this.statUserService.getUserPreferredCategories(
      userId > 0 ? userId : userIdToken,
      limit,
    );
  }

  @Get(':userId/categories/preferences-weighted')
  async getPreferredCategoriesWeighted(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ): Promise<UserCategoryPreferences> {
    return this.statUserService.getUserPreferredCategoriesWeighted(
      userId > 0 ? userId : userIdToken,
      limit,
    );
  }

  @Get(':userId/categories/preferences-by-time')
  async getPreferredCategoriesByTime(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ) {
    return this.statUserService.getUserPreferredCategoriesByTime(
      userId > 0 ? userId : userIdToken,
      limit,
    );
  }

  @Get('users/:userId/watch-time')
  async getUserWatchTime(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<WatchTimeStats> {
    return this.statUserService.getUserWatchTime(userId > 0 ? userId : userIdToken);
  }

}
