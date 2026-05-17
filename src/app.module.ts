import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './common-service/mail.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './auth/constant';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerMiddleware } from './common-middleware/logger-middle-ware';
import { LoggerService } from './common-service/logger.service';

import { I18nModule } from 'nestjs-i18n';
import { HeaderLanguageResolver } from './i18n/resolver/i18n-lang.resolver';

import * as path from 'path';

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
import { TmdbModule } from './tmdb/tmdb.module';
import { SupportModule } from './support/support.module';
import { SimilarTitleModule } from './similar-title/similar-title.module';
import { StreamModule } from './stream/stream.module';
import { StatUserModule } from './stat-user/stat-user.module';
import { DocumentationModule } from './documentation/documentation.module';
import { CreditModule } from './credit/credit.module';
import { VersionModule } from './version/version.module';
import { LibraryModule } from './library/library.module';

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [HeaderLanguageResolver]
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 50,
      }
    ]),

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
    TmdbModule,
    SupportModule,
    SimilarTitleModule,
    StreamModule,
    StatUserModule,
    DocumentationModule,
    CreditModule,
    VersionModule,
    LibraryModule
  ],

  providers: [
    MailService,
    LoggerService,

    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    }
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}