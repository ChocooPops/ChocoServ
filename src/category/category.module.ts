import { forwardRef, Module } from '@nestjs/common';
import { CategoryService } from './service/category.service';
import { CategoryController } from './controller/category.controller';
import { MovieModule } from 'src/movie/movie.module';
import { SeriesModule } from 'src/series/series.module';
import { MediaModule } from 'src/media/media.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [forwardRef(() => UserModule), forwardRef(() => MediaModule), forwardRef(() => MovieModule), forwardRef(() => SeriesModule)],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService]
})
export class CategoryModule { }
