import { Module } from '@nestjs/common';
import { SelectionController } from './controller/selection.controller';
import { SelectionService } from './service/selection.service';
import { MediaModule } from 'src/media/media.module';
import { SeriesModule } from 'src/series/series.module';
import { MovieModule } from 'src/movie/movie.module';
import { SearchService } from 'src/common-service/search.service';
import { CategoryModule } from 'src/category/category.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule, MediaModule, SeriesModule, MovieModule, CategoryModule],
  providers: [SelectionService, SearchService],
  controllers: [SelectionController],
  exports: [SelectionService]
})
export class SelectionModule { }
