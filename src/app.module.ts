import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './common-service/mail.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './auth/constant';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { MediaModule } from './media/media.module';
import { MovieModule } from './movie/movie.module';
import { SeriesModule } from './series/series.module';
import { SelectionModule } from './selection/selection.module';
import { LicenseModule } from './license/license.module';
import { NewsModule } from './news/news.module';
import { NewsVideoRunningModule } from './news-video-running/news-video-running.module';
import { CategoryModule } from './category/category.module';
import { ProfilPhotoModule } from './profil-photo/profil-photo.module';
import { PosterModule } from './poster/poster.module';
import { JellyfinModule } from './jellyfin/jellyfin.module';
import { TmdbModule } from './tmdb/tmdb.module';
import { SupportModule } from './support/support.module';
import { SimilarTitleModule } from './similar-title/similar-title.module';
import { StreamModule } from './stream/stream.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = jwtConstants(configService);
        return {
          secret: config.secret,
          signOptions: { expiresIn: config.expiresIn },
        };
      },
      inject: [ConfigService],
    }),
    UserModule,
    AuthModule,
    MediaModule,
    MovieModule,
    SeriesModule,
    SelectionModule,
    LicenseModule,
    NewsModule,
    NewsVideoRunningModule,
    CategoryModule,
    ProfilPhotoModule,
    PosterModule,
    JellyfinModule,
    TmdbModule,
    SupportModule,
    SimilarTitleModule,
    StreamModule
  ],
  controllers: [AppController],
  providers: [
    MailService,
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ],
})
export class AppModule {

  /*
    //AJOUTER UNE LATENCE FICTIVE;
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(DelayMiddlewareService).forRoutes('*');
    }
  */

}