import { forwardRef, Module } from '@nestjs/common';
import { TmdbService } from './service/tmdb.service';
import { TmdbController } from './controller/tmdb.controller';
import { CategoryModule } from 'src/category/category.module';
import { HttpModule } from '@nestjs/axios';
import { SearchService } from 'src/common-service/search.service';
import { LibraryModule } from 'src/library/library.module';

@Module({
  imports: [CategoryModule, HttpModule, forwardRef(() => LibraryModule)],
  providers: [TmdbService, SearchService],
  controllers: [TmdbController],
  exports: [TmdbService]
})
export class TmdbModule { }
