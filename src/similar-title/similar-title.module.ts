import { forwardRef, Module } from '@nestjs/common';
import { JellyfinModule } from 'src/jellyfin/jellyfin.module';
import { SimilarTitleService } from './service/similar-title.service';
import { SimilarTitleController } from './controller/similar-title.controller';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { MediaModule } from 'src/media/media.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [forwardRef(() => UserModule), MediaModule, forwardRef(() => JellyfinModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule)],
  providers: [SimilarTitleService],
  controllers: [SimilarTitleController],
  exports: [SimilarTitleService]
})
export class SimilarTitleModule { }
