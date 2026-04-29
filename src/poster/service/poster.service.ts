import { Injectable } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { UploadImageService } from 'src/common-service/upload-image.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditMedia } from 'src/media/dto/edit-media.interface';
import { SelectionType } from 'src/selection/dto/selection-type.enum';
import { PosterType } from '../dto/poster-type.enum';
import { EditPoster } from 'src/media/dto/edit-poster.interface';
import { exec } from "child_process";
import { promisify } from "util";
import { EditSeason } from 'src/series/dto/edit-season.interface';
import { EditEpisode } from 'src/series/dto/edit-episode.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { Media } from 'src/media/dto/media.interface';
import { Poster } from 'src/media/dto/poster.interface';
const execPromise = promisify(exec);

@Injectable()
export class PosterService {

    private scaleMainPoster: number[] = [100, 300, 350, 600, 900, 1400, 1920];
    private scaleLogo: number[] = [200, 300, 500, 700];
    private scaleSeries: number[] = [300, 600, 900];
    private scaleCredit: number[] = [100, 300, 600, 900];
    private notDownload: string = 'notDownload';

    constructor(private uploadImageService: UploadImageService,
        private formatPathService: FormatPathService) { }

    public async insertManyPosterByMedia(media: EditMedia, mediaType: MediaType, formatedTitle: string, mediaId: number, conn: mariadb.PoolConnection): Promise<string> {
        const folder: string = mediaType === MediaType.MOVIE ? this.uploadImageService.getUploadDirToMovie() : this.uploadImageService.getUploadDirToSeries();
        const messageLogoPoster: string = await this.insertLogoMedia(media.logo, formatedTitle, mediaType, mediaId, conn, folder);
        const messageBackPoster: string = await this.insertBackgroundMedia(media.backgroundImage, media.horizontalPosterSameAsBackground, formatedTitle, mediaType, mediaId, conn, folder);
        const messageVerticalPoster: string = await this.insertManyVerticalPosterByMedia(media.posters, formatedTitle, mediaType, mediaId, conn, folder);
        const messageHorizontalPoster: string = await this.insertManyHorizontalPoster(media.horizontalPoster, formatedTitle, mediaType, mediaId, conn, folder);
        return `${messageLogoPoster} \n ${messageBackPoster} \n ${messageVerticalPoster} \n ${messageHorizontalPoster}`;
    }
    public async deleteOrUpdatePosterByMedia(updateMedia: EditMedia, oldMedia: Media, mediaType: MediaType, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        const folder: string = mediaType === MediaType.MOVIE ? this.uploadImageService.getUploadDirToMovie() : this.uploadImageService.getUploadDirToSeries();
        const messageLogoPoster: string = await this.deleteOrUpdatePosterMediaPoster(updateMedia.id, updateMedia.logo, oldMedia.srcLogo, [], formatedTitle, mediaType, 'srcLogo', folder, false, conn);
        const messageBackPoster: string = await this.deleteOrUpdatePosterMediaPoster(updateMedia.id, updateMedia.backgroundImage, oldMedia.srcBackgroundImage, oldMedia.srcPoster.horizontal, formatedTitle, mediaType, 'srcBackground', folder, updateMedia.horizontalPosterSameAsBackground, conn);
        const messageVerticalPoster: string = await this.deleteOrUpdateVerticalPoster(updateMedia.id, updateMedia.posters, oldMedia.srcPoster, formatedTitle, mediaType, conn, folder);
        const messageHorizontalPoster: string = await this.deleteOrUpdateHorizontalPoster(updateMedia.id, updateMedia.horizontalPoster, oldMedia.srcPoster.horizontal, oldMedia.srcBackgroundImage, formatedTitle, mediaType, conn, folder);
        return `${messageLogoPoster} \n ${messageBackPoster} \n ${messageVerticalPoster} \n ${messageHorizontalPoster}`;
    }

    private async insertLogoMedia(logo: string | ArrayBuffer | null, formatedTitle: string, mediaType: MediaType, mediaId: number, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        if (logo && this.uploadImageService.isBase64Image(logo)) {
            try {
                const [posterId, messagePoster] = await this.insertOnePoster(logo, formatedTitle, mediaType, conn);
                if (messagePoster.state && messagePoster.other) {
                    await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                    const queryUpdateMedia: string = `UPDATE Media SET srcLogo = ? WHERE id = ?`;
                    await conn.query(queryUpdateMedia, [posterId, mediaId]);
                    await this.compressedPosterByScale(`${folder}/${formatedTitle}`, [messagePoster.other], this.scaleLogo, 'w');
                    return 'Logo inséré';
                }
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucun logo n'est à ajouter";
        }
    }
    private async insertBackgroundMedia(back: string | ArrayBuffer | null, same: boolean, formatedTitle: string, mediaType: MediaType, mediaId: number, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        if (back && this.uploadImageService.isBase64Image(back)) {
            try {
                const [posterId, messagePoster] = await this.insertOnePoster(back, formatedTitle, mediaType, conn);
                if (messagePoster.state && messagePoster.other) {
                    await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                    const queryUpdateMedia: string = `UPDATE Media SET srcBackground = ? WHERE id = ?`;
                    await conn.query(queryUpdateMedia, [posterId, mediaId]);
                    if (same) {
                        await conn.query(`INSERT INTO Media_Poster (mediaId, posterId, type)
                        VALUES (?, ?, ?)`, [mediaId, posterId, PosterType.HORIZONTAL]);
                    }
                    await this.compressedPosterByScale(`${folder}/${formatedTitle}`, [messagePoster.other], this.scaleMainPoster, 'w');
                    return 'Arrière plan inséré';
                }
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucun arrière plan n'a été inséré";
        }
    }
    private async insertManyVerticalPosterByMedia(posters: EditPoster[], formatedTitle: string, mediaType: MediaType, mediaId: number, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        const values: any[] = [];
        const iteration: string[] = [];
        for (const poster of posters) {
            if (poster.srcPoster) {
                try {
                    const [posterId, messagePoster] = await this.insertOnePoster(poster.srcPoster, formatedTitle, mediaType, conn);
                    if (messagePoster.state && messagePoster.other) {
                        await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                        for (const type of poster.typePoster) {
                            if (type.type_id == SelectionType.NORMAL_POSTER) {
                                values.push(mediaId, posterId, PosterType.NORMAL);
                                iteration.push(messagePoster.other);
                            } else if (type.type_id == SelectionType.SPECIAL_POSTER) {
                                values.push(mediaId, posterId, PosterType.SPECIAL);
                                iteration.push(messagePoster.other);
                            } else {
                                values.push(mediaId, posterId, PosterType.LICENSE);
                                iteration.push(messagePoster.other);
                            }
                        }
                    }
                } catch (error) {
                    throw error;
                }
            }
        }
        if (iteration.length > 0) {
            const queryInsertMediaPoster = `
            INSERT INTO Media_Poster (mediaId, posterId, type)
            VALUES ${iteration.map(() => '(?, ?, ?)').join(', ')}`;
            const resultInsertMediaPoster = await conn.query(queryInsertMediaPoster, values);
            await this.compressedPosterByScale(`${folder}/${formatedTitle}`, iteration, this.scaleMainPoster, 'h');
            return `Posters verticaux insérés : ${resultInsertMediaPoster.affectedRows}`;
        } else {
            return `Aucun poster vertical n'est à insérer`
        }
    }
    private async insertManyHorizontalPoster(posters: EditPoster[], formatedTitle: string, mediaType: MediaType, mediaId: number, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        const values: any[] = [];
        const iteration: string[] = [];
        for (const poster of posters) {
            if (poster.srcPoster) {
                try {
                    const [posterId, messagePoster] = await this.insertOnePoster(poster.srcPoster, formatedTitle, mediaType, conn);
                    if (messagePoster.state && messagePoster.other) {
                        await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                        values.push(mediaId, posterId, PosterType.HORIZONTAL);
                        iteration.push(messagePoster.other);
                    }
                } catch (error) {
                    throw error;
                }
            }
        }
        if (iteration.length > 0) {
            const queryInsertMediaPoster = `
            INSERT INTO Media_Poster (mediaId, posterId, type)
            VALUES ${iteration.map(() => '(?, ?, ?)').join(', ')}`;
            const resultInsertMediaPoster = await conn.query(queryInsertMediaPoster, values);
            await this.compressedPosterByScale(`${folder}/${formatedTitle}`, iteration, this.scaleMainPoster, 'w');
            return `Posters horizontaux insérés : ${resultInsertMediaPoster.affectedRows}`;
        } else {
            return `Aucun poster horizontal n'est à insérer`;
        }
    }

    private async deleteOrUpdatePosterMediaPoster(mediaId: number, newPoster: ArrayBuffer | string, oldPoster: string, oldSrcHorizontal: string[], formatedTitle: string, mediaType: MediaType, field: 'srcLogo' | 'srcBackground', folder: string, same: boolean, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (newPoster) {
                if (this.uploadImageService.isBase64Image(newPoster)) {
                    if (oldPoster) {
                        const oldPosterId: number = this.getIdByPosterName(oldPoster);
                        await conn.query(`DELETE FROM Media_Poster WHERE posterId = ?`, [oldPosterId]);
                        await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                        await this.deletePosterByIdFromMedia(formatedTitle, oldPoster, 'w', mediaType);
                    }
                    if (field === 'srcLogo') {
                        return await this.insertLogoMedia(newPoster, formatedTitle, mediaType, mediaId, conn, folder);
                    } else {
                        return await this.insertBackgroundMedia(newPoster, same, formatedTitle, mediaType, mediaId, conn, folder);
                    }
                } else {
                    if (typeof newPoster === 'string') {
                        const posterId: number = this.getIdByPosterName(newPoster);
                        if (same && !oldSrcHorizontal.some((item) => this.uploadImageService.getBasename(item) === this.uploadImageService.getBasename(newPoster))) {
                            await conn.query(`INSERT INTO Media_Poster (mediaId, posterId, type)
                                VALUES (?, ?, ?)`, [mediaId, posterId, PosterType.HORIZONTAL]);
                        } else {
                            await conn.query(`DELETE FROM Media_Poster WHERE posterId = ?`, [posterId]);
                        }
                    }
                    return `${field} - (aucun changement)`;
                }
            } else if (oldPoster) {
                const oldPosterId: number = this.getIdByPosterName(oldPoster);
                await conn.query(`DELETE FROM Media_Poster WHERE posterId = ?`, [oldPosterId]);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromMedia(formatedTitle, oldPoster, 'w', mediaType);
                return `${field} - (supprimé)`;
            } else {
                return `${field} - (aucun changement)`
            }
        } catch (error) {
            throw error;
        }
    }
    private async deleteOrUpdateHorizontalPoster(mediaId: number, newPosters: EditPoster[], oldPosters: string[], oldSrcBack: string, formatedTitle: string, mediaType: MediaType, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        try {
            if (oldSrcBack) {
                oldPosters = oldPosters.filter((item) => this.uploadImageService.getBasename(item) !== this.uploadImageService.getBasename(oldSrcBack));
            }
            let messageInsert: string = '';
            let messageDelete: string = '';
            const posterHorizontalToInsert: EditPoster[] = newPosters.filter(item => item.srcPoster && this.uploadImageService.isBase64Image(item.srcPoster));
            const posterHorizontalToDelete: string[] = oldPosters.filter(item =>
                !newPosters.some(newItem =>
                    typeof newItem.srcPoster === 'string' &&
                    this.uploadImageService.getBasename(newItem.srcPoster) ===
                    this.uploadImageService.getBasename(item)
                )
            );
            for (const poster of posterHorizontalToDelete) {
                const oldPosterId: number = this.getIdByPosterName(poster);
                await conn.query(`DELETE FROM Media_Poster WHERE posterId = ?`, [oldPosterId]);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromMedia(formatedTitle, poster, 'w', mediaType);
                messageDelete += `Poster ${oldPosterId} supprimé \n`;
            }
            if (posterHorizontalToInsert.length > 0) {
                messageInsert = await this.insertManyHorizontalPoster(posterHorizontalToInsert, formatedTitle, mediaType, mediaId, conn, folder);
            }
            if (posterHorizontalToInsert.length > 0 || posterHorizontalToDelete.length > 0) {
                return `${messageInsert} \n ${messageDelete}`;
            } else {
                return `Aucun poster horizontal n'a été modifié`;
            }
        } catch (error) {
            throw error;
        }
    }
    private async deleteOrUpdateVerticalPoster(mediaId: number, newPosters: EditPoster[], oldPosters: Poster, formatedTitle: string, mediaType: MediaType, conn: mariadb.PoolConnection, folder: string): Promise<string> {
        try {
            let messageInsert: string = '';
            let messageDelete: string = '';
            let messageUpdate: string = '';
            const uniqueOldPosters: string[] = Array.from(
                new Set([
                    ...oldPosters.normal,
                    ...oldPosters.special,
                    ...oldPosters.license
                ])
            );
            const posterVerticalToUpdate: EditPoster[] = newPosters.filter(item => item.srcPoster && !this.uploadImageService.isBase64Image(item.srcPoster));
            const posterVerticalToInsert: EditPoster[] = newPosters.filter(item => item.srcPoster && this.uploadImageService.isBase64Image(item.srcPoster));
            const posterVerticalToDelete: string[] = uniqueOldPosters.filter(item =>
                !newPosters.some(newItem =>
                    typeof newItem.srcPoster === 'string' &&
                    this.uploadImageService.getBasename(newItem.srcPoster) ===
                    this.uploadImageService.getBasename(item)
                )
            );
            for (const poster of posterVerticalToDelete) {
                const oldPosterId: number = this.getIdByPosterName(poster);
                await conn.query(`DELETE FROM Media_Poster WHERE posterId = ?`, [oldPosterId]);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromMedia(formatedTitle, poster, 'h', mediaType);
                messageDelete += `Poster ${oldPosterId} supprimé \n`;
            }
            for (const poster of posterVerticalToUpdate) {
                if (typeof poster.srcPoster === 'string') {
                    const posterId: number = this.getIdByPosterName(poster.srcPoster);
                    await conn.query(`DELETE FROM Media_Poster WHERE mediaId = ? AND posterId = ?`, [mediaId, posterId]);
                    const values: any[] = [];
                    const iteration: number[] = [];
                    poster.typePoster.forEach((type) => {
                        if (type.type_id == SelectionType.NORMAL_POSTER) {
                            values.push(mediaId, posterId, PosterType.NORMAL);
                            iteration.push(0);
                        } else if (type.type_id == SelectionType.SPECIAL_POSTER) {
                            values.push(mediaId, posterId, PosterType.SPECIAL);
                            iteration.push(0);
                        } else {
                            values.push(mediaId, posterId, PosterType.LICENSE);
                            iteration.push(0);
                        }
                    });
                    const queryInsertMediaPoster = `
                        INSERT INTO Media_Poster (mediaId, posterId, type)
                        VALUES ${iteration.map(() => '(?, ?, ?)').join(', ')}`;
                    await conn.query(queryInsertMediaPoster, values);
                }
            }
            if (posterVerticalToInsert.length > 0) {
                messageInsert = await this.insertManyVerticalPosterByMedia(posterVerticalToInsert, formatedTitle, mediaType, mediaId, conn, folder);
            }

            if (posterVerticalToInsert.length > 0 || posterVerticalToDelete.length > 0 || posterVerticalToUpdate.length > 0) {
                return `${messageInsert} \n ${messageDelete} \n ${messageUpdate}`;
            } else {
                return `Aucun poster horizontal n'a été modifié`;
            }
        } catch (error) {
            throw error;
        }
    }

    public async insertManySeasonPoster(seasonIds: number[], seasons: EditSeason[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        const iteration: string[] = [];
        let message = '';
        for (const [index, seasonId] of seasonIds.entries()) {
            const poster = seasons[index].srcPoster;
            if (poster) {
                try {
                    const [posterId, messagePoster] = await this.insertOnePoster(poster, formatedTitle, MediaType.SERIES, conn);
                    if (messagePoster.state && messagePoster.other) {
                        await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                        const queryUpdateSeason: string = `UPDATE Season SET srcPoster = ? WHERE id = ?`;
                        await conn.query(queryUpdateSeason, [posterId, seasonId]);
                        message += `Poster ${seasons[index].name} inséré \n`;
                        iteration.push(messagePoster.other);
                    }
                } catch (error) {
                    throw error;
                }
            }
        }
        if (iteration.length > 0) {
            await this.compressedPosterByScale(`${this.uploadImageService.getUploadDirToSeries()}/${formatedTitle}`, iteration, this.scaleSeries, 'h');
        }
        return message;
    }
    public async insertManyEpisodePoster(episodeIds: number[], episodes: EditEpisode[], formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        const iteration: string[] = [];
        let message = '';
        for (const [index, episodeId] of episodeIds.entries()) {
            const poster = episodes[index].srcPoster;
            if (poster) {
                try {
                    const [posterId, messagePoster] = await this.insertOnePoster(poster, formatedTitle, MediaType.SERIES, conn);
                    if (messagePoster.state && messagePoster.other) {
                        await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                        const queryUpdateSeason: string = `UPDATE Episode SET srcPoster = ? WHERE id = ?`;
                        await conn.query(queryUpdateSeason, [posterId, episodeId]);
                        message += `Poster ${episodes[index].name} inséré \n`;
                        iteration.push(messagePoster.other);
                    }
                } catch (error) {
                    throw error;
                }
            }
        }
        if (iteration.length > 0) {
            await this.compressedPosterByScale(`${this.uploadImageService.getUploadDirToSeries()}/${formatedTitle}`, iteration, this.scaleSeries, 'w');
        }
        return message;
    }

    public async deleteOrUpdatePosterFromOneEpisodeOrSeason(rowId: number, newPoster: ArrayBuffer | string, oldPoster: string, formatedTitle: string, field: 'Season' | 'Episode', conn: mariadb.PoolConnection): Promise<string> {
        try {
            const formatPoster: 'h' | 'w' = field === 'Season' ? 'h' : 'w';
            if (newPoster) {
                if (this.uploadImageService.isBase64Image(newPoster)) {
                    let message: string = '\n';
                    if (oldPoster) {
                        const oldPosterId: number = this.getIdByPosterName(oldPoster);
                        await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                        await this.deletePosterByIdFromMedia(formatedTitle, oldPoster, formatPoster, MediaType.SERIES);
                    }
                    const [posterId, messagePoster] = await this.insertOnePoster(newPoster, formatedTitle, MediaType.SERIES, conn);
                    if (messagePoster.state && messagePoster.other) {
                        await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                        const queryUpdateSeason: string = `UPDATE ${field} SET srcPoster = ? WHERE id = ?`;
                        await conn.query(queryUpdateSeason, [posterId, rowId]);
                        await this.compressedPosterByScale(`${this.uploadImageService.getUploadDirToSeries()}/${formatedTitle}`, [messagePoster.other], this.scaleSeries, formatPoster);
                        message = `Poster ${field} ${rowId} inséré \n`;
                    }
                    return message;
                } else {
                    return `${rowId} - (aucun changement)`;
                }
            } else if (oldPoster) {
                const oldPosterId: number = this.getIdByPosterName(oldPoster);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromMedia(formatedTitle, oldPoster, formatPoster, MediaType.SERIES);
                return `Poster ${field} ${rowId} - (supprimé)`;
            } else {
                return `Poster ${field} ${rowId} - (aucun changement)`
            }
        } catch (error) {
            throw error;
        }
    }

    public async insertPosterLicense(srcPoster: string | ArrayBuffer | null, formatedTitle: string, licenseId: number, field: 'srcIcon' | 'srcLogo' | 'srcBackground', conn: mariadb.PoolConnection): Promise<string> {
        const folder: string = this.uploadImageService.getUploadDirToLicense();
        if (srcPoster && this.uploadImageService.isBase64Image(srcPoster)) {
            try {
                const [posterId, messagePoster] = await this.insertOnePoster(srcPoster, formatedTitle, MediaType.LICENSE, conn);
                if (messagePoster.state && messagePoster.other) {
                    await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                    const queryUpdateMedia: string = `UPDATE License SET ${field} = ? WHERE id = ?`;
                    await conn.query(queryUpdateMedia, [posterId, licenseId]);
                    await this.compressedPosterByScale(`${folder}/${formatedTitle}`, [messagePoster.other], this.scaleMainPoster, 'w');
                    return `${field} inséré`;
                }
            } catch (error) {
                throw error;
            }
        } else {
            return `Aucun ${field} n'est à ajouter`;
        }
    }

    public async modifyOrDeletePosterFromLicense(licenseId: number, newPoster: string | ArrayBuffer | null, oldPoster: string, formatedTitle: string, field: 'srcIcon' | 'srcLogo' | 'srcBackground', conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (newPoster) {
                if (this.uploadImageService.isBase64Image(newPoster)) {
                    if (oldPoster) {
                        const oldPosterId: number = this.getIdByPosterName(oldPoster);
                        await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                        await this.deletePosterByIdFromLicense(formatedTitle, oldPoster);
                    }
                    return await this.insertPosterLicense(newPoster, formatedTitle, licenseId, field, conn);
                } else {
                    return `${field} - (aucun changement)`;
                }
            } else if (oldPoster) {
                const oldPosterId: number = this.getIdByPosterName(oldPoster);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromLicense(formatedTitle, oldPoster);
                return `${field} - (supprimé)`;
            } else {
                return `${field} - (aucun changement)`;
            }
        } catch (error) {
            throw error;
        }
    }

    private async insertOnePoster(poster: ArrayBuffer | string, formatedTitle: string, mediaType: MediaType, conn: mariadb.PoolConnection): Promise<[number, ReturnMessage]> {
        try {
            const queryInsert: string = 'INSERT INTO Poster (name) VALUES (?)';
            const resultInsert = await conn.query(queryInsert, [this.notDownload]);
            const posterId = Number(resultInsert.insertId);
            const posterName = `${posterId}.${this.uploadImageService.getImageExtensionFromBase64(poster)}`;
            let messagePoster !: ReturnMessage;
            if (mediaType === MediaType.MOVIE || mediaType === MediaType.SERIES) {
                messagePoster = await this.uploadImageService.saveImageToMediaType(poster, formatedTitle, posterName, mediaType);
            } else if (mediaType === MediaType.LICENSE) {
                messagePoster = await this.uploadImageService.saveImageToLicense(poster, formatedTitle, posterName);
            } else if (mediaType === MediaType.CREDIT) {
                messagePoster = await this.uploadImageService.saveImageToCredit(poster, formatedTitle, posterName);
            }
            return [posterId, messagePoster];
        } catch (error) {
            console.log(error)
            throw error;
        }
    }

    private async updateNameOnePoster(posterId: number, name: string, conn: mariadb.PoolConnection): Promise<any> {
        try {
            const queryUpdatePoster: string = `UPDATE Poster SET name = ? WHERE id = ?`;
            await conn.query(queryUpdatePoster, [name, posterId]);
        } catch (error) {
            throw error;
        }
    }

    private async compressedPosterByScale(path: string, posters: string[], scales: number[], format: 'w' | 'h'): Promise<any> {
        for (const scale of scales) {
            const pathScale: string = `${path}/${scale}${format}`;
            await this.uploadImageService.createDirectory(pathScale);
            let scaleFormated: string;
            if (format === 'h') {
                scaleFormated = `${-1}:${scale}`;
            } else {
                scaleFormated = `${scale}:${-1}`;
            }
            for (const poster of posters) {
                const pathPosterOriginel: string = `${path}/${poster}`;
                const pathPosterCompressed: string = `${pathScale}/${poster}`;
                await this.execFfmpegCommandToCompressedImage(pathPosterOriginel, scaleFormated, pathPosterCompressed);
            }
        }
    }

    private async execFfmpegCommandToCompressedImage(originelPoster: string, scale: string, newPoster: string): Promise<ReturnMessage> {
        try {
            const command = `ffmpeg -i ${originelPoster} -vf scale=${scale} -c:v libwebp -quality 80 -y ${newPoster}`;
            const { stdout } = await execPromise(command);
            return {
                id: 1,
                state: true,
                message: 'succes'
            }
        } catch (error) {
            return {
                id: 0,
                state: false,
                message: 'error'
            }
        }
    }

    public async deteleAllPostersLinkedToMedia(mediaId: number, posterIds: number[], formatedTitle: string, mediaType: MediaType, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const resultDeleteMediaPoster = await conn.query(`DELETE FROM Media_Poster WHERE mediaId = ?`, [mediaId]);
            await this.uploadImageService.deleteFileOrDirectoryToMediaType(formatedTitle, mediaType);
            if (posterIds.length > 0) {
                const queryDeletePoster: string = `DELETE FROM POSTER WHERE id IN (${posterIds.map(() => '?').join(', ')})`;
                const resultDeletePoster = await conn.query(queryDeletePoster, posterIds);
                return `Media Poster (${resultDeleteMediaPoster.affectedRows}) \n Poster (${resultDeletePoster.affectedRows})`;
            } else {
                return 'Poster (0)';
            }
        } catch (error) {
            throw error;
        }
    }

    public async deleteAllPostersLinkedToLicense(licenseId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const resultSelect = await conn.query(`SELECT name, srcIcon, srcLogo, srcBackground FROM License WHERE id = ?`, licenseId);
            const posterIds: number[] = [];
            if (resultSelect[0].srcIcon) posterIds.push(Number(resultSelect[0].srcIcon));
            if (resultSelect[0].srcLogo) posterIds.push(Number(resultSelect[0].srcLogo));
            if (resultSelect[0].srcBackground) posterIds.push(Number(resultSelect[0].srcBackground));
            const formatedTitle: string = this.formatPathService.formatPath(resultSelect[0].name);
            await this.uploadImageService.deleteFileOrDirectoryToLicense(formatedTitle);
            if (posterIds.length > 0) {
                const queryDeletePoster: string = `DELETE FROM Poster WHERE id IN (${posterIds.map(() => '?').join(', ')})`;
                const resultDeletePoster = await conn.query(queryDeletePoster, posterIds);
                return `Poster (${resultDeletePoster.affectedRows})`;
            } else {
                return 'Poster (0)';
            }
        } catch (error) {
            throw error;
        }
    }

    private async deletePosterByIdFromLicense(formatedTitle: string, srcPoster: string): Promise<void> {
        try {
            const scales: number[] = Array.from(
                new Set([
                    ...this.scaleMainPoster,
                    ...this.scaleLogo,
                    ...this.scaleSeries
                ])
            );
            const originelPath: string = `${formatedTitle}/${this.uploadImageService.getBasename(srcPoster)}`;
            await this.uploadImageService.deleteFileOrDirectoryToLicense(originelPath);
            for (const scale of scales) {
                const pathCustom: string = `${formatedTitle}/${scale}w/${this.uploadImageService.getBasename(srcPoster)}`;
                await this.uploadImageService.deleteFileOrDirectoryToLicense(pathCustom);
            }
        } catch (error) {
            throw error;
        }
    }

    private async deletePosterByIdFromMedia(formatedTitle: string, srcPoster: string, format: 'h' | 'w', mediaType: MediaType): Promise<void> {
        try {
            const scales: number[] = Array.from(
                new Set([
                    ...this.scaleMainPoster,
                    ...this.scaleLogo,
                    ...this.scaleSeries
                ])
            );
            const originelPath: string = `${formatedTitle}/${this.uploadImageService.getBasename(srcPoster)}`;
            await this.uploadImageService.deleteFileOrDirectoryToMediaType(originelPath, mediaType);
            for (const scale of scales) {
                const pathCustom: string = `${formatedTitle}/${scale}${format}/${this.uploadImageService.getBasename(srcPoster)}`;
                await this.uploadImageService.deleteFileOrDirectoryToMediaType(pathCustom, mediaType);
            }
        } catch (error) {
            throw error;
        }
    }

    private async deletePosterByIdFromCredit(formatedTitle: string, srcPoster: string, format: 'h' = 'h'): Promise<void> {
        try {
            const scales: number[] = Array.from(
                new Set([
                    ...this.scaleMainPoster,
                    ...this.scaleLogo,
                    ...this.scaleSeries,
                    ...this.scaleCredit
                ])
            );
            const originelPath: string = `${formatedTitle}/${this.uploadImageService.getBasename(srcPoster)}`;
            await this.uploadImageService.deleteFileOrDirectoryToCredit(originelPath);
            for (const scale of scales) {
                const pathCustom: string = `${formatedTitle}/${scale}${format}/${this.uploadImageService.getBasename(srcPoster)}`;
                await this.uploadImageService.deleteFileOrDirectoryToCredit(pathCustom);
            }
        } catch (error) {
            throw error;
        }
    }

    public async insertPosterCredit(poster: string | ArrayBuffer | null, creditId: number, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        if (poster && this.uploadImageService.isBase64Image(poster)) {
            try {
                const [posterId, messagePoster] = await this.insertOnePoster(poster, formatedTitle, MediaType.CREDIT, conn);
                if (messagePoster.state && messagePoster.other) {
                    await this.updateNameOnePoster(posterId, messagePoster.other, conn);
                    const queryUpdateMedia: string = `UPDATE Credit SET srcPoster = ? WHERE id = ?`;
                    await conn.query(queryUpdateMedia, [posterId, creditId]);
                    await this.compressedPosterByScale(`${this.uploadImageService.getUploadDirToCredit()}/${formatedTitle}`, [messagePoster.other], this.scaleCredit, 'h');
                    return `Poster de ${formatedTitle} inséré`;
                }
            } catch (error) {
                throw error;
            }
        } else {
            return "Aucun poster n'est à ajouter";
        }
    }
    public async modifyOrDeletePosterFromCredit(creditId: number, newPoster: string | ArrayBuffer | null, oldPoster: string, formatedTitle: string, conn: mariadb.PoolConnection): Promise<string> {
        try {
            if (newPoster) {
                if (this.uploadImageService.isBase64Image(newPoster)) {
                    if (oldPoster) {
                        const oldPosterId: number = this.getIdByPosterName(oldPoster);
                        await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                        await this.deletePosterByIdFromCredit(formatedTitle, oldPoster);
                    }
                    return await this.insertPosterCredit(newPoster, creditId, formatedTitle, conn);
                } else {
                    return `(aucun changement du poster)`;
                }
            } else if (oldPoster) {
                const oldPosterId: number = this.getIdByPosterName(oldPoster);
                await conn.query(`DELETE FROM Poster WHERE id = ?`, [oldPosterId]);
                await this.deletePosterByIdFromCredit(formatedTitle, oldPoster);
                return `(poster supprimé)`;
            } else {
                return `(aucun changement du poster)`;
            }
        } catch (error) {
            throw error;
        }
    }

    private getIdByPosterName(name: string): number {
        const pathname: string = this.uploadImageService.getBasename(name);
        return Number(pathname.split('.')[0]);
    }

}

