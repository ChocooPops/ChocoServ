import { forwardRef, Module } from '@nestjs/common';
import { LibraryService } from './service/library.service';
import { LibraryController } from './controller/library.controller';
import { ParseFilePathService } from 'src/common-service/parse-file-path.service';
import { UserModule } from 'src/user/user.module';
import { TmdbModule } from 'src/tmdb/tmdb.module';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';

@Module({
  imports: [forwardRef(() => UserModule), forwardRef(() => TmdbModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule)],
  providers: [LibraryService, ParseFilePathService],
  controllers: [LibraryController],
  exports: [LibraryService]
})
export class LibraryModule {}
