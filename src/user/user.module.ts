import { Module } from '@nestjs/common';
import { UserService } from './service/user.service';
import { UserController } from './controller/user.controller';
import { DatabaseModule } from 'src/database/database.module';
import { FormatPathService } from 'src/common-service/format-path.service';
import { ProfilPhotoService } from 'src/profil-photo/service/profil-photo.service';
import { MailService } from 'src/common-service/mail.service';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { MediaModule } from 'src/media/media.module';

@Module({
  imports: [MediaModule, MovieModule, SeriesModule, DatabaseModule],
  providers: [UserService, FormatPathService, ProfilPhotoService, MailService],
  controllers: [UserController],
  exports: [UserService]
})
export class UserModule { }
