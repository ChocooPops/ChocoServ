import { Module } from '@nestjs/common';
import { StreamService } from './service/stream.service';
import { StreamController } from './controller/stream.controller';
import { MovieModule } from 'src/movie/movie.module';
import { AuthModule } from 'src/auth/auth.module';
import { SeriesModule } from 'src/series/series.module';
import { NewsVideoRunningModule } from 'src/news-video-running/news-video-running.module';
import { StatUserModule } from 'src/stat-user/stat-user.module';

@Module({
  imports: [MovieModule, AuthModule, SeriesModule, NewsVideoRunningModule, StatUserModule],
  providers: [StreamService],
  controllers: [StreamController]
})
export class StreamModule { }
