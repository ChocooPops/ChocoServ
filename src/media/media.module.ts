import { forwardRef, Module } from '@nestjs/common';
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
import { MediaSubstitutionSerivce } from './service/media-substitution/media-substitution.service';
import { MediaService } from './service/media/media.service';

@Module({
  imports: [PosterModule, forwardRef(() => UserModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule), forwardRef(() => StatUserModule), CreditModule],
  providers: [MediaService, SearchService, VerifTimerShowService, FormatPathService, MediaSubstitutionSerivce],
  controllers: [MediaController],
  exports: [MediaService]
})
export class MediaModule { }
