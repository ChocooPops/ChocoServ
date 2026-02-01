import { Module } from '@nestjs/common';
import { NewsVideoRunningService } from './service/news-video-running.service';
import { NewsVideoRunningController } from './controller/news-video-running.controller';
import { FormatPathService } from 'src/common-service/format-path.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { MediaModule } from 'src/media/media.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule, MediaModule, MovieModule, SeriesModule],
  providers: [NewsVideoRunningService, FormatPathService, VerifTimerShowService],
  controllers: [NewsVideoRunningController],
  exports: [NewsVideoRunningService]
})
export class NewsVideoRunningModule { }
