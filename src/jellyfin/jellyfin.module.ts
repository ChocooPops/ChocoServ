import { forwardRef, Module } from '@nestjs/common';
import { JellyfinService } from './service/jellyfin.service';
import { JellyfinController } from './controller/jellyfin.controller';
import { HttpModule } from '@nestjs/axios';
import { MovieModule } from 'src/movie/movie.module';
import { TmdbModule } from 'src/tmdb/tmdb.module';
import { SeriesModule } from 'src/series/series.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [HttpModule, forwardRef(() => UserModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule), forwardRef(() => TmdbModule)],
  providers: [JellyfinService],
  controllers: [JellyfinController],
  exports: [JellyfinService]
})
export class JellyfinModule { }
