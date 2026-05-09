import { forwardRef, Module } from '@nestjs/common';
import { TmdbService } from './service/tmdb.service';
import { TmdbController } from './controller/tmdb.controller';
import { CategoryModule } from 'src/category/category.module';
import { HttpModule } from '@nestjs/axios';
import { LibraryModule } from 'src/library/library.module';

@Module({
  imports: [CategoryModule, HttpModule, forwardRef(() => LibraryModule)],
  providers: [TmdbService],
  controllers: [TmdbController],
  exports: [TmdbService]
})
export class TmdbModule { }
