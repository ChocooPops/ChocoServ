import { Module } from '@nestjs/common';
import { LicenseService } from './service/license.service';
import { LicenseController } from './controller/license.controller';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterModule } from 'src/poster/poster.module';
import { SearchService } from 'src/common-service/search.service';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { SelectionModule } from 'src/selection/selection.module';
import { MediaModule } from 'src/media/media.module';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule, PosterModule, MediaModule, MovieModule, SeriesModule, SelectionModule],
  providers: [LicenseService, FormatPathService, SearchService, UploadImageService],
  controllers: [LicenseController]
})
export class LicenseModule { }
