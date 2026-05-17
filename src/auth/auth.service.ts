import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/service/user.service';
import { VerificationCodeModel } from './dto/verification-code';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/common-service/mail.service';
import { Role } from 'src/user/dto/role.enum';
import { TokenModel } from './dto/token.interface';
import { User } from 'src/user/dto/user.interface';
import { RegisterUser } from 'src/user/dto/register-user.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import * as bcrypt from 'bcryptjs';
import { jwtConstants } from 'src/auth/constant';
import { ConfigService } from '@nestjs/config';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class AuthService {

    private temporaryCode: VerificationCodeModel[] = [];
    private timeAfterRemoving: number = 5 * 60 * 1000;

    constructor(private readonly jwtService: JwtService,
        private readonly userService: UserService,
        private readonly mailService: MailService,
        private readonly configService: ConfigService,
        private readonly i18nService: I18nService
    ) { }

    async signIn(email: string, password: string): Promise<TokenModel> {
        const user: User = await this.userService.getUserByEmail(email);
        if (user) {
            if (user.role !== Role.NOT_ACTIVATE) {
                if (await bcrypt.compare(password.trim(), user.password)) {
                    if (user.role !== Role.SUSPENDED) {
                        return {
                            access_token: await this.generateJwt(user)
                        };
                    } else {
                        throw new UnauthorizedException(this.i18nService.t('common.AUTH.ACCOUNT_SUSPENDED'));
                    }
                } else {
                    throw new NotFoundException(this.i18nService.t('common.AUTH.INCORRECT_PASSWORD'));
                }
            } else {
                throw new UnauthorizedException(this.i18nService.t('common.AUTH.ACCOUNT_NOT_ACTIVATED'));
            }
        } else {
            throw new NotFoundException(this.i18nService.t('common.AUTH.EMAIL_ADRESS_NOT_FOUND'));
        }
    }

    async generateJwt(user: User) {
        const payload = { sub: user.id, email: user.email, pseudo: user.pseudo, role: user.role };
        return this.jwtService.signAsync(payload);
    }

    //CODE DE VERIFICATION SendVerificationCode
    public async sendVerificationCode(newUser: RegisterUser): Promise<ReturnMessage> {
        const lang = I18nContext.current()?.lang;

        const message = {
            id: 0,
            state: false,
            message: ''
        }
        if (newUser.pseudo && newUser.firstName && newUser.lastName && newUser.dateBorn && newUser.email) {
            const userBd: User | null = await this.userService.getUserByEmail(newUser.email);
            if (userBd) {
                if (userBd.role === Role.NOT_ACTIVATE) {
                    message.message = this.i18nService.t('common.AUTH.REGISTRATION_REQUEST_PENDING_APPROVAL');
                    message.state = false;
                } else {
                    message.message = this.i18nService.t('common.AUTH.USERNAME_ALREADY_EXISTS');
                    message.state = false;
                }
            } else {
                if (this.isValidEmail(newUser.email)) {
                    if (newUser.pseudo.trim().length >= 5) {
                        if (this.hasCodeForEmail(newUser.email)) {
                            message.message = this.i18nService.t('common.AUTH.CODE_ALREADY_SENT');
                            message.state = true;
                        } else {
                            const code: number = this.generateUnique6DigitCode(newUser);
                            await this.mailService.sendVerificationCode(newUser.email, code, lang);
                            message.message = this.i18nService.t('common.AUTH.CODE_SEND');
                            message.state = true;
                        }
                    } else {
                        message.message = this.i18nService.t('common.AUTH.INVALID_USERNAME');
                        message.state = false;
                    }
                } else {
                    message.message = this.i18nService.t('common.AUTH.INVALID_EMAIL_ADDRESS');
                    message.state = false;
                }
            }
        }
        return message;
    }

    public async saveNewUserNotActivate(code: number, email: string): Promise<ReturnMessage> {
        const userBd: User | null = await this.userService.getUserByEmail(email);
        if (!userBd) {
            const newUser: RegisterUser | null = this.getCodeByCodeAndEmail(code, email)?.user;
            if (newUser) {
                try {
                    await this.userService.registerNewUser(newUser);
                    return {
                        id: 0,
                        state: true,
                        message: this.i18nService.t('common.AUTH.REGISTRATION_REQUEST_SENT')
                    }
                } catch (error: any) {
                    return {
                        id: 0,
                        state: false,
                        message: error.sqlMessage
                    }
                }
            } else {
                return {
                    id: 0,
                    state: false,
                    message: this.i18nService.t('common.AUTH.INVALID_VERIFICATION_CODE')
                }
            }
        } else {
            return {
                id: 0,
                state: false,
                message: this.i18nService.t('common.AUTH.USER_ALREADY_REGISTERED')
            }
        }
    }

    private generateUnique6DigitCode(user: RegisterUser): number {
        let code: number;

        do {
            code = Math.floor(100000 + Math.random() * 900000);
        } while (this.temporaryCode.some(c => c.code === code));

        const newEntry: VerificationCodeModel = {
            id: this.temporaryCode.length + 1,
            user,
            code,
        };

        this.temporaryCode.push(newEntry);

        setTimeout(() => {
            this.temporaryCode = this.temporaryCode.filter(c => c.code !== code);
        }, this.timeAfterRemoving);

        return code;
    }

    public async createNewCodeCodeByEmail(email: string): Promise<ReturnMessage> {
        const lang = I18nContext.current()?.lang;

        const userAlreadyExist: User | null = await this.userService.getUserByEmail(email);
        if (!userAlreadyExist) {
            try {
                const user: RegisterUser = this.getCodeByEmail(email)?.user;
                if (user) {
                    this.deleteCodeByEmail(email);
                    const code: number = this.generateUnique6DigitCode(user);
                    await this.mailService.sendVerificationCode(user.email, code, lang);
                    return {
                        id: 0,
                        state: true,
                        message: this.i18nService.t('common.AUTH.CODE_SENT')
                    }
                } else {
                    return {
                        id: 0,
                        state: false,
                        message: this.i18nService.t('common.AUTH.EMAIL_ADRESS_NOT_FOUND')
                    }
                }
            } catch (error) {
                return {
                    id: 0,
                    state: false,
                    message: this.i18nService.t('common.ERROR')
                }
            }
        } else {
            return {
                id: 0,
                state: false,
                message: this.i18nService.t('common.AUTH.USER_ALREADY_REGISTERED')
            }
        }
    }

    private getCodeByCodeAndEmail(code: number, email: string): VerificationCodeModel | undefined {
        return this.temporaryCode.find(entry => entry.code === code && entry.user.email === email);
    }

    private getCodeByEmail(email: string): VerificationCodeModel | undefined {
        return this.temporaryCode.find(entry => entry.user.email === email);
    }

    private hasCodeForEmail(email: string): boolean {
        return this.temporaryCode.some(entry => entry.user.email === email);
    }

    private deleteCodeByEmail(email: string): void {
        this.temporaryCode = this.temporaryCode.filter(
            entry => entry.user.email !== email
        );
    }

    private isValidEmail(email: string): boolean {
        const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[A-Za-z]{2,}$/;
        return regex.test(email);
    }

    public async verifToken(token: string): Promise<boolean> {
        if (!token) {
            throw new UnauthorizedException(this.i18nService.t('common.AUTH.MISSING_INVALID_TOKEN'));
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: jwtConstants(this.configService).secret,
            });
            const user: User = await this.userService.getUserById(payload.sub);
            if (!user || user.role === Role.NOT_ACTIVATE || user.role === Role.SUSPENDED) {
                throw new UnauthorizedException(this.i18nService.t('common.AUTH.USER_DISABLED_OR_NOT_EXIST'));
            }
        } catch (error) {
            throw new UnauthorizedException(this.i18nService.t('common.AUTH.INVALID_EXPIRED_TOKEN'));
        }
        return true;
    }

}