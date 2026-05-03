import { Module } from '@nestjs/common';
import { VersionService } from './service/version.service';
import { VersionController } from './controller/version.controller';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  providers: [VersionService],
  controllers: [VersionController]
})
export class VersionModule {}
