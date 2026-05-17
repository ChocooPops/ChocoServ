import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { User } from '../dto/user.interface';
import { RegisterUser } from '../dto/register-user.interface';
import { Role } from '../dto/role.enum';
import { Media } from 'src/media/dto/media.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { ProfilPhoto } from 'src/profil-photo/dto/profil-photo.interface';
import { UpdateUser } from '../dto/update-user.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { ProfilPhotoService } from 'src/profil-photo/service/profil-photo.service';
import * as bcrypt from 'bcryptjs';
import { MailService } from 'src/common-service/mail.service';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { MediaService } from 'src/media/service/media/media.service';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class UserService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly profilPhotoService: ProfilPhotoService,
        private readonly mailService: MailService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly i18nService: I18nService) { }

    private getQuerySelectMediaList(WHERE: string): string {
        return `
        SELECT 
        ${this.mediaService.getQuerySelectManyMedia(`ORDER BY um.createdAt asc`)} AS media
        FROM User_Media_List um
        LEFT JOIN media m ON m.id = um.mediaId
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        GROUP BY um.userId`;
    }

    public async getRoleByUserId(id: number): Promise<User | null> {
        try {
            const query: string = `SELECT u.id, u.pseudo, u.role FROM User u WHERE u.id = ?`;
            const user: User[] = await this.pool.query(query, [id]);
            return user[0] ?? null;
        } catch (error) {
            return null;
        }
    }

    public async getUserById(id: number, getPassword: boolean = false): Promise<User | null> {
        try {
            const query: string = `
                SELECT u.id, u.pseudo, u.firstName, u.lastName, u.email, u.role, u.createdAt, DATE_FORMAT(u.dateBorn, '%Y-%m-%d') AS dateBorn, p.name as profilPhoto
                ${getPassword ? ', u.password' : ''}
                FROM user u
                LEFT JOIN Profil_Photo p
                ON p.id = u.profilPhoto
                Where u.id = ?`
            const user: User[] = await this.pool.query(query, [id]);
            if (user[0] && user[0].profilPhoto) {
                user[0].profilPhoto = this.formatPathService.getUrlProfilPhoto(user[0].profilPhoto);
            }
            return user[0] ?? null;
        } catch (error) {
            return null;
        }
    }

    public async getUserByEmail(email: string): Promise<User | null> {
        const conn = await this.pool.getConnection();
        try {
            const user: User[] = await conn.query(`SELECT * FROM USER WHERE email = ? `, email);
            return user[0] ?? null;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async registerNewUser(newUser: RegisterUser): Promise<User> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const profilPhoto: ProfilPhoto | null = await this.profilPhotoService.getRandomProfilPhoto();
            const user: User[] = await conn.query(`INSERT INTO User (
                pseudo,
                password,
                firstName,
                lastName,
                dateBorn,
                email,
                role,
                profilPhoto
            ) VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
            );`, [newUser.pseudo, 'null', newUser.firstName, newUser.lastName, newUser.dateBorn, newUser.email, Role.NOT_ACTIVATE, profilPhoto.id || null]);
            await conn.commit();
            return user[0];
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async getAllUser(): Promise<User[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = `
            SELECT u.id, u.pseudo, u.firstName, u.lastName, u.email, u.role, p.name as profilPhoto,
            DATE_FORMAT(u.dateBorn, '%Y-%m-%d') AS dateBorn
            FROM USER u
            LEFT JOIN Profil_Photo p
            ON p.id = u.profilPhoto`;
            const user: User[] = await conn.query(query);
            user.forEach((user: User) => {
                user.profilPhoto = this.formatPathService.getUrlProfilPhoto(user.profilPhoto);
            });
            return user;
        } catch (error) {
            return []
        } finally {
            await conn.release();
        }
    }

    public async getMyMediaListByUserId(userId: number): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectMediaList(`WHERE um.userId = ?`);
            const results: any[] = await conn.query(query, [userId, userId, userId]);
            const medias: Media[] = results[0].media;
            medias.forEach((media: Media, index) => {
                if (media.mediaType === MediaType.MOVIE) {
                    medias[index] = this.movieService.getFormatedMovie(media);
                } else if (media.mediaType === MediaType.SERIES) {
                    medias[index] = this.seriesService.getFormatedSeries(media);
                }
            });
            return medias;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async toggleMediaIntoList(userId: number, mediaId: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const mediaIsIntoList = await conn.query(`
                SELECT id FROM User_Media_List WHERE userId = ? AND mediaId = ?`, [userId, mediaId]);
            if (mediaIsIntoList.length > 0) {
                const query: string = `DELETE FROM User_Media_List WHERE userId = ? AND mediaId = ?`;
                await conn.query(query, [userId, mediaId]);
                await conn.commit();
                return {
                    id: 1,
                    state: false,
                    message: this.i18nService.t("common.USER.MEDIA_REMOVED_FROM_LIST")
                }
            } else {
                const query: string = `
                    INSERT INTO User_Media_List (userId, mediaId)
                    VALUES (?, ?)`;
                await conn.query(query, [userId, mediaId]);
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: this.i18nService.t("common.USER.MEDIA_ADDED_FROM_LIST")
                }
            }
        } catch (error) {
            await conn.rollback();
            return null;
        } finally {
            await conn.release();
        }
    }

    public async updateProfilPictureByUserId(userId: number, idProfilPicture: number): Promise<ProfilPhoto> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const photo: ProfilPhoto = await this.profilPhotoService.getProfilPhotoById(idProfilPicture);
            if (photo) {
                const query: string = `
                UPDATE User
                SET profilPhoto = ?
                Where id = ?`;
                await conn.query(query, [idProfilPicture, userId]);
                await conn.commit();
                photo.name = this.formatPathService.getUrlProfilPhoto(photo.name);
                return photo;
            } else {
                return null;
            }
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async updateUserByUserId(userId: number, updateUser: UpdateUser): Promise<ReturnMessage> {
        const currentUser: User | null = await this.getUserById(userId, true);
        if (updateUser.pseudo && updateUser.pseudo.trim().length >= 5) {
            if (updateUser.date && this.isDateString(updateUser.date)) {
                let message: string = "";
                let messagePseudo: string | undefined = undefined;
                let messageDate: string | undefined = undefined;
                let messagePassWord: string | undefined = undefined;

                if (currentUser.pseudo !== updateUser.pseudo) {
                    messagePseudo = this.i18nService.t("common.USER.PSEUDO_MODIFIED", {
                        args: {
                            oldPseudo: currentUser.pseudo,
                            newPseudo: updateUser.pseudo
                        }
                    });
                    currentUser.pseudo = updateUser.pseudo;
                }
                const oldDate = new Date(currentUser.dateBorn).toISOString().split("T")[0];;
                const newDate = new Date(updateUser.date).toISOString().split("T")[0];
                if (oldDate !== newDate) {
                    messageDate = this.i18nService.t("common.USER.DATE_BORN_MODIFIED", {
                        args: {
                            oldDateBorn: currentUser.dateBorn,
                            newDateBorn: updateUser.date
                        }
                    });
                    currentUser.dateBorn = new Date(updateUser.date);
                }
                let opPassWord: boolean = true;
                if (updateUser.currentPassWord && updateUser.newPassWord && updateUser.reNewPassWord) {
                    if (await bcrypt.compare(updateUser.currentPassWord, currentUser.password)) {
                        if (updateUser.newPassWord === updateUser.reNewPassWord) {
                            if (!await bcrypt.compare(updateUser.newPassWord, currentUser.password)) {
                                if (updateUser.newPassWord.length >= 10) {
                                    currentUser.password = await bcrypt.hash(updateUser.newPassWord.trim(), 15);
                                    messagePassWord = this.i18nService.t("common.USER.PASSWORD_SUCCESSFULLY_CHANGED");
                                } else {
                                    messagePassWord = this.i18nService.t("common.USER.PASSWORD_NOT_SECURE");
                                    opPassWord = false;
                                }
                            } else {
                                messagePassWord = this.i18nService.t("common.USER.PASSWORD_ALREADY_REGISTERED");
                                opPassWord = false;
                            }
                        } else {
                            messagePassWord = this.i18nService.t("common.USER.DIFFERENT_PASSWORD");
                            opPassWord = false;
                        }
                    } else {
                        messagePassWord = this.i18nService.t("common.AUTH.INCORRECT_PASSWORD");
                        opPassWord = false;
                    }
                }

                if (!messagePseudo && !messageDate && !messagePassWord) {
                    message += `${this.i18nService.t("common.USER.NO_CHANGES")} \n`
                } else {
                    const conn = await this.pool.getConnection();
                    try {
                        await conn.beginTransaction();
                        if (messagePseudo) message += messagePseudo + " \n";
                        if (messageDate) message += messageDate + " \n";
                        if (messagePassWord) message += messagePassWord + " \n";
                        const query: string = `
                            UPDATE USER
                            SET pseudo = ?,
                            firstName = ?,
                            lastName = ?,
                            dateBorn = ?
                            WHERE id = ?`;
                        await conn.query(query, [currentUser.pseudo, currentUser.firstName, currentUser.lastName, currentUser.dateBorn, currentUser.id]);
                        if (opPassWord) {
                            await conn.query(`
                                UPDATE User 
                                SET password = ?
                                WHERE id = ?`, [currentUser.password, currentUser.id])
                        }
                        await conn.commit();
                    } catch (error: any) {
                        await conn.rollback();
                        message = error.sqlMessage;
                        return {
                            id: 0,
                            message: message,
                            state: false
                        }
                    } finally {
                        await conn.release();
                    }
                }
                return {
                    id: 0,
                    message: message,
                    state: true
                }
            } else {
                return {
                    id: -1,
                    message: this.i18nService.t("common.USER.INCORRECT_DATE_BORN"),
                    state: false
                }
            }
        } else {
            return {
                id: -1,
                message: this.i18nService.t("common.USER.INCORRECT_PSEUDO"),
                state: false
            }
        }
    }

    private isDateString(value: string): boolean {
        const timestamp = Date.parse(value);
        return !isNaN(timestamp);
    }

    public async updateUserRoleByAdmin(userId: number, role: Role): Promise<ReturnMessage> {
        const lang = I18nContext.current()?.lang;
        
        const user: User | null = await this.getUserById(userId);
        if (user) {
            if (Object.values(Role).includes(role)) {
                if (user.role !== role) {
                    if (user.role !== Role.ADMIN) {
                        let newPassWord: string | null = null;
                        let changePassword: boolean = false;
                        if (role !== Role.SUSPENDED || user.role !== Role.NOT_ACTIVATE) {
                            if (user.role === Role.NOT_ACTIVATE) {
                                const password: string = `${this.randomizeString(user.pseudo)}-${this.randomizeString(user.firstName)}-${this.randomizeString(user.lastName)}-${this.randomizeString(user.email)}`;
                                const hashedPassword = await bcrypt.hash(password, 15);
                                user.password = hashedPassword;
                                newPassWord = password;
                                changePassword = true;
                            }
                            if (role === Role.NOT_ACTIVATE) {
                                user.password = 'null';
                                changePassword = true;
                            }
                            user.role = role;
                            const conn = await this.pool.getConnection();
                            try {
                                await conn.beginTransaction();
                                const query: string = `
                                    UPDATE User
                                    SET role = ?
                                    WHERE id = ?;`
                                await conn.query(query, [user.role, user.id]);
                                if (changePassword) {
                                    await conn.query(`
                                        UPDATE User
                                        SET password = ?
                                        WHERE id = ?`, [user.password, user.id]);
                                }
                                if (newPassWord) {
                                    await this.mailService.sendMailWhenUserRoleActivated(user, newPassWord, lang);
                                }
                                if (user.role === Role.SUSPENDED) {
                                    await this.mailService.sendMailSuspendedUser(user, lang);
                                }
                                await conn.commit();
                            } catch (error: any) {
                                await conn.rollback();
                                return {
                                    id: -1,
                                    state: false,
                                    message: error.sqlMessage
                                }
                            } finally {
                                await conn.release();
                            }
                            return {
                                id: -1,
                                state: true,
                                message: this.i18nService.t("common.USER.ROLE_MODIFIED")
                            }
                        } else {
                            return {
                                id: -1,
                                state: false,
                                message: this.i18nService.t("common.USER.DEACTIVATED_USER_CANNOT_BE_SUSPENDED")
                            }
                        }
                    } else {
                        return {
                            id: -1,
                            state: false,
                            message: this.i18nService.t("common.USER.ADMIN_CONNOT_BE_MODIFIED")
                        }
                    }
                } else {
                    return {
                        id: -1,
                        state: false,
                        message: this.i18nService.t("common.USER.ROLE_ALREADY_REGISTERED")
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.USER.ROLE_NOT_EXISTS")
                }
            }
        } else {
            return {
                id: -1,
                state: false,
                message: this.i18nService.t("common.USER.USER_NOT_FOUND")
            }
        }
    }

    public async deleteUserById(userId: number, verifRole: boolean = false): Promise<ReturnMessage> {
        const user: User | null = await this.getUserById(userId);
        if (user) {
            if (verifRole && user.role === Role.ADMIN) {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.USER.ADMIN_CANNOT_BE_EDITED")
                }
            } else {
                const conn = await this.pool.getConnection();
                try {
                    await conn.beginTransaction();
                    await conn.query(`DELETE FROM User_Media_List WHERE userId = ?`, [user.id]);
                    await conn.query(`DELETE FROM Stat_User WHERE userId = ?`, [user.id]);
                    const query: string = `DELETE FROM User WHERE id = ?`;
                    await conn.query(query, [user.id]);
                    await conn.commit();
                    return {
                        id: -1,
                        state: true,
                        message: this.i18nService.t("common.USER.USER_DELETED")
                    }
                } catch (error: any) {
                    await conn.rollback();
                    return {
                        id: -1,
                        state: false,
                        message: error.sqlMessage
                    }
                } finally {
                    await conn.release();
                }
            }
        } else {
            return {
                id: -1,
                state: false,
                message: this.i18nService.t("common.USER.USER_UNFOUND")
            }
        }
    }

    private randomizeString(input: string): string {
        const symbols = ['!', '@', '#', '$', '%', '&', '*', '?'];
        const numbers = '0123456789';
        let output = '';
        for (const char of input) {
            let newChar = char;
            if (/[a-zA-Z]/.test(char) && Math.random() < 0.5) {
                newChar = char.toUpperCase();
            }
            output += newChar;
            if (Math.random() < 0.3) {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                output += randomSymbol;
            }
            if (Math.random() < 0.3) {
                const randomDigit = numbers[Math.floor(Math.random() * numbers.length)];
                output += randomDigit;
            }
        }
        return output;
    }

}
