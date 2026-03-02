import { Module } from '@nestjs/common';
import { DocumentationService } from './service/documentation.service';
import { DocumentationController } from './controller/documentation.controller';

@Module({
  providers: [DocumentationService],
  controllers: [DocumentationController]
})
export class DocumentationModule {}
