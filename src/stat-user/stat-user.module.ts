import { Module } from '@nestjs/common';
import { StatUserController } from './controller/stat-user.controller';
import { StatUserService } from './service/stat-user.service';

@Module({
  providers: [StatUserService],
  controllers: [StatUserController],
  exports: [StatUserService]
})
export class StatUserModule { }
