import { forwardRef, Module } from '@nestjs/common';
import { MovieService } from './service/movie.service';
import { MovieController } from './controller/movie.controller';
import { SearchService } from 'src/common-service/search.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { PosterModule } from 'src/poster/poster.module';
import { FormatPathService } from 'src/common-service/format-path.service';
import { SimilarTitleModule } from 'src/similar-title/similar-title.module';
import { UserModule } from 'src/user/user.module';
import { StatUserModule } from 'src/stat-user/stat-user.module';
import { CreditModule } from 'src/credit/credit.module';

@Module({
  imports: [forwardRef(() => UserModule), forwardRef(() => SimilarTitleModule), PosterModule, StatUserModule, CreditModule],
  providers: [MovieService, SearchService, VerifTimerShowService, FormatPathService],
  controllers: [MovieController],
  exports: [MovieService]
})
export class MovieModule { }
