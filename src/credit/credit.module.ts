import { Module } from '@nestjs/common';
import { CreditService } from './service/credit.service';
import { CreditController } from './controller/credti.controller';

@Module({
  providers: [CreditService],
  controllers: [CreditController],
  exports: [CreditService]
})
export class CreditModule {}
