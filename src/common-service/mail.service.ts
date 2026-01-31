import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { User } from 'src/user/dto/user.interface';
import { FormSupport } from 'src/support/dto/form-support.interface';
import { join } from 'path';
import * as hbs from 'nodemailer-express-handlebars';

@Injectable()
export class MailService {

    private transporter: any;
    private frame1: string = "https://chocoopops.github.io/portfolio/assets/frame1.png";
    private frame2: string = "https://chocoopops.github.io/portfolio/assets/frame2.png";

    constructor(private configService: ConfigService) {
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

    public async sendVerificationCode(to: string, code: number): Promise<any> {
        const codeString: string = code.toString().split('').join(' ');
        return await this.sendMail({
            to: to,
            subject: "Vérification de l'email",
            template: 'verification-code',
            context: {
                code: codeString,
                backgroundUrl: this.frame1,
            },
        });
    }

    public async sendMailWhenUserRoleActivated(user: User, mdp: string): Promise<any> {
        return await this.sendMail({
            to: user.email,
            subject: "Nouveau mots de passe",
            template: 'password',
            context: {
                pseudo: user.pseudo,
                password: mdp,
                backgroundUrl: this.frame2,
            },
        });
    }

    public async sendMailSuspendedUser(user: User): Promise<void> {
        return await this.sendMail({
            to: user.email,
            subject: "Compte suspendue",
            template: 'suspended',
            context: {
                pseudo: user.pseudo,
                backgroundUrl: this.frame2,
            },
        });
    }

    public async sendFormulaire(form: FormSupport): Promise<any> {
        const html: string = `<p> Thème : ${form.areaConcerned} <br>  Description : ${form.description} </p>`;
        const mailOptions = {
            from: this.configService.get<string>('MAIL_FROM'),
            to: this.configService.get('MAIL_USER'),
            subject: form.subject,
            text: '',
            html: html,
        };
        return await this.transporter.sendMail(mailOptions);
    }

}