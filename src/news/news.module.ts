import { Module } from '@nestjs/common';
import { NewsService } from './service/news.service';
import { NewsController } from './controller/news.controller';
import { FormatPathService } from 'src/common-service/format-path.service';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { MediaModule } from 'src/media/media.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule, MediaModule, MovieModule, SeriesModule],
  providers: [NewsService, FormatPathService],
  controllers: [NewsController]
})
export class NewsModule { }
