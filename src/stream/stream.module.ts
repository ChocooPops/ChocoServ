import { Module } from '@nestjs/common';
import { StreamService } from './service/stream.service';
import { StreamController } from './controller/stream.controller';
import { JellyfinModule } from 'src/jellyfin/jellyfin.module';
import { MovieModule } from 'src/movie/movie.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [JellyfinModule, MovieModule, AuthModule],
  providers: [StreamService],
  controllers: [StreamController]
})
export class StreamModule { }
