import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MailService } from 'src/common-service/mail.service';
import { UserModule } from 'src/user/user.module';

@Module({
    imports: [UserModule],
    providers: [AuthService, MailService],
    controllers: [AuthController],
    exports: [AuthService]
})
export class AuthModule { }
