import { forwardRef, Module } from '@nestjs/common';
import { TmdbService } from './service/tmdb.service';
import { TmdbController } from './controller/tmdb.controller';
import { JellyfinModule } from 'src/jellyfin/jellyfin.module';
import { CategoryModule } from 'src/category/category.module';
import { HttpModule } from '@nestjs/axios';
import { SearchService } from 'src/common-service/search.service';

@Module({
  imports: [forwardRef(() => JellyfinModule), CategoryModule, HttpModule],
  providers: [TmdbService, SearchService],
  controllers: [TmdbController],
  exports: [TmdbService]
})
export class TmdbModule { }
