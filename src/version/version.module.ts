import { Module } from '@nestjs/common';
import { VersionService } from './service/version.service';
import { VersionController } from './controller/version.controller';

@Module({
  providers: [VersionService],
  controllers: [VersionController]
})
export class VersionModule {}
