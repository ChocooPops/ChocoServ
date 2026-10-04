import { Module } from '@nestjs/common';
import { DownloadService } from './service/download.service';
import { DownloadController } from './controller/download.controller';
import { UserModule } from 'src/user/user.module';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [UserModule, MovieModule, SeriesModule, AuthModule],
  providers: [DownloadService],
  controllers: [DownloadController]
})
export class DownloadModule {}
