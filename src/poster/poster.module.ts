import { Module } from '@nestjs/common';
import { PosterService } from './service/poster.service';
import { PosterController } from './controller/poster.controller';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { FormatPathService } from 'src/common-service/format-path.service';

@Module({
  providers: [PosterService, UploadImageService, FormatPathService],
  controllers: [PosterController],
  exports: [PosterService]
})
export class PosterModule { }
