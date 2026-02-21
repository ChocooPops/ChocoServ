import { forwardRef, Module } from '@nestjs/common';
import { StatUserController } from './controller/stat-user.controller';
import { StatUserService } from './service/stat-user.service';
import { MediaModule } from 'src/media/media.module';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { FormatPathService } from 'src/common-service/format-path.service';

@Module({
  imports: [forwardRef(() => MediaModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule)],
  providers: [StatUserService, FormatPathService],
  controllers: [StatUserController],
  exports: [StatUserService]
})
export class StatUserModule { }
