import { Module } from '@nestjs/common';
import { StatUserController } from './controller/stat-user.controller';
import { StatUserService } from './service/stat-user.service';
import { MediaModule } from 'src/media/media.module';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';

@Module({
  imports: [MediaModule, MovieModule, SeriesModule],
  providers: [StatUserService],
  controllers: [StatUserController],
  exports: [StatUserService]
})
export class StatUserModule { }
