import { Controller, ParseIntPipe, Param, Query, Get } from '@nestjs/common';
import { UserCategoryPreferences } from '../dto/user-category-preferences.interface';
import { StatUserService } from '../service/stat-user.service';
import { CurrentUser } from 'src/guard/current-user.guard';
import { WatchTimeStats } from '../dto/watch-time-stats.interface';
import { WatchingStatsResponse } from '../dto/watching-stats-response.interface';
import { PeriodType } from '../dto/period.type';
import { ContentType } from '../dto/content.type';
import { TopMediaResponse } from '../dto/top-media-response.interface';
import { MediaTypeFilter } from '../dto/media-type-filter.interface';

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

  @Get('users/:userId/watching-history')
  async getUserWatchingHistory(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate: string,
    @Query('periodType') periodType: PeriodType = 'month',
    @Query('contentType') contentType: ContentType = 'all',
  ): Promise<WatchingStatsResponse> {
    return this.statUserService.getUserWatchingHistory(
      userId > 0 ? userId : userIdToken,
      startDate,
      periodType,
      contentType,
    );
  }

  @Get('users/:userId/top-media')
  async getUserTopMedia(
    @CurrentUser('sub') userIdToken: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('mediaType') mediaType: MediaTypeFilter = 'all',
  ): Promise<TopMediaResponse> {
    return this.statUserService.getUserTopMedia(userId > 0 ? userId : userIdToken, mediaType);
  }

}
