import { forwardRef, Module } from '@nestjs/common';
import { MediaService } from './service/media.service';
import { MediaController } from './controller/media.controller';
import { SearchService } from 'src/common-service/search.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterModule } from 'src/poster/poster.module';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { UserModule } from 'src/user/user.module';
import { StatUserModule } from 'src/stat-user/stat-user.module';
import { CreditModule } from 'src/credit/credit.module';

@Module({
  imports: [PosterModule, forwardRef(() => UserModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule), forwardRef(() => StatUserModule), CreditModule],
  providers: [MediaService, SearchService, VerifTimerShowService, FormatPathService],
  controllers: [MediaController],
  exports: [MediaService]
})
export class MediaModule { }
