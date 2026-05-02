import { forwardRef, Module } from '@nestjs/common';
import { CreditService } from './service/credit.service';
import { CreditController } from './controller/credti.controller';
import { FormatPathService } from 'src/common-service/format-path.service';
import { PosterModule } from 'src/poster/poster.module';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { UserModule } from 'src/user/user.module';
import { TmdbModule } from 'src/tmdb/tmdb.module';

@Module({
  imports: [PosterModule, forwardRef(() => UserModule), forwardRef(() => TmdbModule)],
  providers: [CreditService, FormatPathService, UploadImageService],
  controllers: [CreditController],
  exports: [CreditService]
})
export class CreditModule {}
