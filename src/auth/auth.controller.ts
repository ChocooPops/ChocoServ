import { Controller, Post, Body } from '@nestjs/common';
import { TokenModel } from './dto/token.interface';
import { Public } from '../guard/public.decorator';
import { AuthModel } from './dto/auth.interface';
import { AuthService } from './auth.service';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { RegisterUser } from 'src/user/dto/register-user.interface';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @Public()
    async login(@Body() body: AuthModel): Promise<TokenModel> {
        return await this.authService.signIn(body.email, body.password);
    }

    @Public()
    @Post('send-verification-code')
    async createNewUserNotActivate(@Body() newUser: RegisterUser): Promise<ReturnMessage> {
        return await this.authService.sendVerificationCode(newUser);
    }
    @Public()
    @Post('register')
    async SendVerificationCode(@Body('verificationCode') code: number, @Body('email') email: string): Promise<ReturnMessage> {
        return await this.authService.saveNewUserNotActivate(code, email);
    }
    @Public()
    @Post('resend-verification-code')
    async createNewCodeCodeByEmail(@Body('email') email: string): Promise<ReturnMessage> {
        return await this.authService.createNewCodeCodeByEmail(email)
    }

}