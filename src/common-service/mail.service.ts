import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { User } from 'src/user/dto/user.interface';
import { FormSupport } from 'src/support/dto/form-support.interface';
import { join } from 'path';
import * as hbs from 'nodemailer-express-handlebars';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class MailService {

    private transporter: any;
    private frame1: string = "https://chocoopops.github.io/portfolio/assets/frame1.png";
    private frame2: string = "https://chocoopops.github.io/portfolio/assets/frame2.png";

    constructor(private readonly configService: ConfigService,
        private readonly i18nService: I18nService
    ) {
        this.init();
    }

    init() {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('MAIL_HOST'),
            port: this.configService.get<number>('MAIL_PORT'),
            secure: false,
            auth: {
                user: this.configService.get<string>('MAIL_USER'),
                pass: this.configService.get<string>('MAIL_PASS'),
            },
        });
        this.transporter.use(
            'compile',
            hbs({
                viewEngine: {
                    extname: '.hbs',
                    layoutsDir: join(__dirname, '..', 'templates'),
                    defaultLayout: 'layout',
                },
                viewPath: join(__dirname, '..', 'templates'),
                extName: '.hbs',
            }),
        );
    }

    private async sendMail(options: any) {
        return await this.transporter.sendMail({
            from: this.configService.get<string>('MAIL_FROM'),
            ...options,
        });
    }

    public async sendVerificationCode(to: string, code: number, lang: string): Promise<any> {
        const codeString: string = code.toString().split('').join(' ');
        return await this.sendMail({
            to,
            subject: this.i18nService.t('common.MAIL.VERIFICATION_CODE.SUBJECT', { lang }),
            template: 'verification-code',
            context: {
                code: codeString,
                backgroundUrl: this.frame1,
                hello: this.i18nService.t('common.MAIL.VERIFICATION_CODE.HELLO', { lang }),
                instruction: this.i18nService.t('common.MAIL.VERIFICATION_CODE.INSTRUCTION', { lang }),
                validity: this.i18nService.t('common.MAIL.VERIFICATION_CODE.VALIDITY', { lang }),
                emailConfirm: this.i18nService.t('common.MAIL.VERIFICATION_CODE.EMAIL_CONFIRM', { lang }),
                ignore: this.i18nService.t('common.MAIL.VERIFICATION_CODE.IGNORE', { lang }),
                regards: this.i18nService.t('common.MAIL.COMMON.REGARDS', { lang }),
                copyright: this.i18nService.t('common.MAIL.COMMON.COPYRIGHT', { lang }),
            },
        });
    }

    public async sendMailWhenUserRoleActivated(user: User, mdp: string, lang: string): Promise<any> {
        return await this.sendMail({
            to: user.email,
            subject: this.i18nService.t('common.MAIL.PASSWORD.SUBJECT', { lang }),
            template: 'password',
            context: {
                pseudo: user.pseudo,
                password: mdp,
                backgroundUrl: this.frame2,
                welcome: this.i18nService.t('common.MAIL.PASSWORD.WELCOME', { lang, args: { pseudo: user.pseudo } }),
                newPassword: this.i18nService.t('common.MAIL.PASSWORD.NEW_PASSWORD', { lang }),
                changePassword: this.i18nService.t('common.MAIL.PASSWORD.CHANGE_PASSWORD', { lang }),
                regards: this.i18nService.t('common.MAIL.COMMON.REGARDS', { lang }),
                copyright: this.i18nService.t('common.MAIL.COMMON.COPYRIGHT', { lang }),
            },
        });
    }

    public async sendMailSuspendedUser(user: User, lang: string): Promise<void> {
        return await this.sendMail({
            to: user.email,
            subject: this.i18nService.t('common.MAIL.SUSPENDED.SUBJECT', { lang }),
            template: 'suspended',
            context: {
                backgroundUrl: this.frame2,
                hello: this.i18nService.t('common.MAIL.SUSPENDED.HELLO', { lang, args: { pseudo: user.pseudo } }),
                reason: this.i18nService.t('common.MAIL.SUSPENDED.REASON', { lang }),
                complaint: this.i18nService.t('common.MAIL.SUSPENDED.COMPLAINT', { lang }),
                backToPaid: this.i18nService.t('common.MAIL.SUSPENDED.BACK_TO_PAID', { lang }),
                payToSuffer: this.i18nService.t('common.MAIL.SUSPENDED.PAY_TO_SUFFER', { lang }),
                noTears: this.i18nService.t('common.MAIL.SUSPENDED.NO_TEARS', { lang }),
                goBack: this.i18nService.t('common.MAIL.SUSPENDED.GO_BACK', { lang }),
                advice: this.i18nService.t('common.MAIL.SUSPENDED.ADVICE', { lang }),
                goodbye: this.i18nService.t('common.MAIL.SUSPENDED.GOODBYE', { lang }),
                copyright: this.i18nService.t('common.MAIL.COMMON.COPYRIGHT', { lang }),
            },
        });
    }

    public async sendFormulaire(form: FormSupport, lang: string): Promise<any> {
        const theme = this.i18nService.t('common.MAIL.FORM.THEME', { lang });
        const description = this.i18nService.t('common.MAIL.FORM.DESCRIPTION', { lang });
        const html: string = `<p>${theme} : ${form.areaConcerned}<br>${description} : ${form.description}</p>`;
        return await this.transporter.sendMail({
            from: this.configService.get<string>('MAIL_FROM'),
            to: this.configService.get('MAIL_USER'),
            subject: form.subject,
            html,
        });
    }

}