import { Module } from '@nestjs/common';
import { SupportService } from './service/support.service';
import { SupportController } from './controller/support.controller';
import { MailService } from 'src/common-service/mail.service';

@Module({
  providers: [SupportService, MailService],
  controllers: [SupportController]
})
export class SupportModule { }
