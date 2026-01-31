import { forwardRef, Module } from '@nestjs/common';
import { MovieService } from './service/movie.service';
import { MovieController } from './controller/movie.controller';
import { JellyfinModule } from 'src/jellyfin/jellyfin.module';
import { SearchService } from 'src/common-service/search.service';
import { VerifTimerShowService } from 'src/common-service/verif-timer-show.service';
import { PosterModule } from 'src/poster/poster.module';
import { FormatPathService } from 'src/common-service/format-path.service';
import { SimilarTitleModule } from 'src/similar-title/similar-title.module';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [forwardRef(() => UserModule), forwardRef(() => JellyfinModule), forwardRef(() => SimilarTitleModule), PosterModule],
  providers: [MovieService, SearchService, VerifTimerShowService, FormatPathService, UploadImageService],
  controllers: [MovieController],
  exports: [MovieService]
})
export class MovieModule { }
