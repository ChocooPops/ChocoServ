import { Module } from '@nestjs/common';
import { PosterService } from './service/poster.service';
import { PosterController } from './controller/poster.controller';
import { UploadImageService } from 'src/common-service/upload-image.service';

@Module({
  providers: [PosterService, UploadImageService],
  controllers: [PosterController],
  exports: [PosterService]
})
export class PosterModule { }
