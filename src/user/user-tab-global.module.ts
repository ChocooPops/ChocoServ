import { Module, Global } from '@nestjs/common';
import { UserTabService } from './service/user-tab/user-tab.service';

@Global()
@Module({
  providers: [UserTabService],
  exports: [UserTabService],
})
export class UserTabGlobalModule {}