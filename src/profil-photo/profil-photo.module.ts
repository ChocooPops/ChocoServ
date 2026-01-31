import { Module } from '@nestjs/common';
import { ProfilPhotoService } from './service/profil-photo.service';
import { ProfilPhotoController } from './controller/profil-photo.controller';
import { FormatPathService } from 'src/common-service/format-path.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  providers: [ProfilPhotoService, FormatPathService],
  controllers: [ProfilPhotoController]
})
export class ProfilPhotoModule { }
