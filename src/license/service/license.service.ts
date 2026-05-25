import { Injectable, Inject } from '@nestjs/common';
import { License } from '../dto/license.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditLicense } from '../dto/edit-license.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import { PosterService } from 'src/poster/service/poster.service';
import { FormatPathService } from 'src/common-service/format-path.service';
import * as mariadb from 'mariadb';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Media } from 'src/media/dto/media.interface';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { SelectionService } from 'src/selection/service/selection.service';
import { Selection } from 'src/selection/dto/selection.interface';
import { Graph } from 'src/common-interface/graph.intrface';
import { Node } from 'src/common-interface/node.interface';
import { Link } from 'src/common-interface/link.interface';
import { MediaService } from 'src/media/service/media/media.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class LicenseService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly posterService: PosterService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly selectionService: SelectionService,
        private readonly i18nService: I18nService) { }

    public async getGraphLicense(): Promise<Graph> {
        const conn = await this.pool.getConnection();
        try {
            const nodes: Node[] = await conn.query(`SELECT id, name FROM License`);
            const selectionLinks: Link[] = await conn.query(`SELECT licenseId as source, selectionId as target, "${MediaType.SELECTION}" as targetType FROM License_Selection`);
            const mediaLinks: Link[] = await conn.query(`SELECT licenseId as source, mediaId as target, "${MediaType.MEDIA}" as targetType FROM  License_Media`);
            return {
                nodes: nodes,
                links: [...mediaLinks, ...selectionLinks]
            }
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectSimpleLicense(WHERE: string, ORDER: string): string {
        return `
            SELECT l.id, l.name, l.orderIndex, l.position, pi.name as srcIcon, pl.name as srcLogo, pb.name as srcBackground
            FROM license l
            LEFT JOIN poster pi ON pi.id = l.srcIcon
            LEFT JOIN poster pl ON pl.id = l.srcLogo
            LEFT JOIN poster pb ON pb.id = l.srcBackground
            ${WHERE} 
            ${ORDER}`;
    }

    private getQuerySelectLicense(WHERE: string): string {
        return `
            SELECT
                JSON_OBJECT(
                    'id', lic.id,
                    'name', lic.name,
                    'orderIndex', lic.orderIndex,
                    'position', lic.position,
                    'srcIcon', pli.name,
                    'srcLogo', pll.name,
                    'srcBackground', plb.name,
                    'mediaList', media_license.medias,
                    'selectionList', selections_license.selections
                ) AS license
            FROM license lic
            LEFT JOIN poster pli ON pli.id = lic.srcIcon
            LEFT JOIN poster pll ON pll.id = lic.srcLogo
            LEFT JOIN poster plb ON plb.id = lic.srcBackground

            LEFT JOIN (
                SELECT lm.licenseId,
                    ${this.mediaService.getQuerySelectManyMedia(`ORDER BY lm.orderIndex ASC`)} AS medias
                FROM license_media lm
                JOIN media m ON m.id = lm.mediaId
                ${this.mediaService.getQueryJoinMedia()}
                WHERE lm.licenseId = ?
                GROUP BY lm.licenseId
            ) media_license ON media_license.licenseId = lic.id

            LEFT JOIN (
                SELECT ls.licenseId,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', sel.id,
                            'name', sel.name,
                            'selectionType', sel.selectionType,
                            'mediaList', sel_media.medias
                        )
                        ORDER BY ls.orderIndex
                    ) AS selections
                FROM license_selection ls
                JOIN selection sel ON sel.id = ls.selectionId
                LEFT JOIN (
                    SELECT sm.selectionId,
                        ${this.mediaService.getQuerySelectManyMedia(`ORDER BY sm.orderIndex ASC`)} AS medias
                    FROM selection_media sm
                    JOIN media m ON m.id = sm.mediaId
                    ${this.mediaService.getQueryJoinMedia()}
                    WHERE sm.selectionId IN (
                        SELECT ls2.selectionId
                        FROM license_selection ls2
                        WHERE ls2.licenseId = ?
                    )
                    GROUP BY sm.selectionId
                ) sel_media ON sel_media.selectionId = sel.id
                WHERE ls.licenseId = ?
                GROUP BY ls.licenseId
            ) selections_license ON selections_license.licenseId = lic.id

            ${WHERE};`;
    }

    private getFormatedLicense(license: any): License {
        const formatedLicense: License = license.license ? license.license : license;
        formatedLicense.position = formatedLicense.position && (formatedLicense.position as any) === 1 ? true : false;
        formatedLicense.srcIcon = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.id, MediaType.LICENSE, formatedLicense.srcIcon);
        formatedLicense.srcLogo = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.id, MediaType.LICENSE, formatedLicense.srcLogo);
        formatedLicense.srcBackground = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.id, MediaType.LICENSE, formatedLicense.srcBackground);
        if (formatedLicense.mediaList) {
            formatedLicense.mediaList.forEach((media: Media, index) => {
                if (media.mediaType === MediaType.MOVIE) {
                    formatedLicense.mediaList[index] = this.movieService.getFormatedMovie(media);
                } else if (media.mediaType === MediaType.SERIES) {
                    formatedLicense.mediaList[index] = this.seriesService.getFormatedSeries(media);
                }
            });
        } else {
            formatedLicense.mediaList = [];
        }
        if (formatedLicense.selectionList) {
            formatedLicense.selectionList.forEach((selection: Selection, index) => {
                formatedLicense.selectionList[index] = this.selectionService.getFormatedSelection(selection);
            });
        } else {
            formatedLicense.selectionList = [];
        }
        return formatedLicense;
    }

    public async getLicenseHome(): Promise<License[]> {
        const conn = await this.pool.getConnection();
        try {
            const WHERE: string = `WHERE position = ?`;
            const ORDER: string = `ORDER BY l.orderIndex asc`;
            const query: string = this.getQuerySelectSimpleLicense(WHERE, ORDER);
            const results: License[] = await conn.query(query, [1]);
            results.forEach((license: License, index) => {
                results[index] = this.getFormatedLicense(license);
            });
            return results;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getLicenseResearch(): Promise<License[]> {
        const conn = await this.pool.getConnection();
        try {
            const WHERE: string = `WHERE position = ?`;
            const ORDER: string = `ORDER BY l.orderIndex asc`;
            const query: string = this.getQuerySelectSimpleLicense(WHERE, ORDER);
            const results: License[] = await conn.query(query, [0]);
            results.forEach((license: License, index) => {
                results[index] = this.getFormatedLicense(license);
            });
            return results;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getLicenseByResearched(keyWord: string): Promise<License[]> {
        const conn = await this.pool.getConnection();
        try {
            const WHERE: string = `WHERE l.name like ?`;
            const ORDER: string = `ORDER BY ABS(CHAR_LENGTH(l.name) - CHAR_LENGTH(?)) ASC`;
            const query: string = this.getQuerySelectSimpleLicense(WHERE, ORDER);
            const licenses: License[] = await conn.query(query, [`%${keyWord}%`, keyWord]);
            licenses.forEach((license: License, index) => {
                licenses[index] = this.getFormatedLicense(license);
            });
            return licenses;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getEntirelyLicenseById(userId: number, id: number): Promise<License> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectLicense(`WHERE lic.id = ?`);
            const result = await conn.query(query, [userId, userId, id, userId, userId, id, id, id]);
            return this.getFormatedLicense(result[0]);
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async insertNewLicense(newLicense: EditLicense): Promise<ReturnMessage> {
        let returnMessage !: ReturnMessage;
        if (newLicense.name && newLicense.name.trim() !== '') {
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const maxLicense = await conn.query('Select count(id) as orderIndex FROM License');
                const newOrderIndex = maxLicense[0]?.orderIndex !== null ? Number(maxLicense[0].orderIndex) + 1 : 1000;
                const queryInsertLicense: string = `INSERT INTO License (name, position, orderIndex) VALUES (?, ?, ?)`;
                const resultInsertLicense = await conn.query(queryInsertLicense, [newLicense.name.trim(), newLicense.position ? 1 : 0, newOrderIndex]);
                const licenseId: number = Number(resultInsertLicense.insertId);
                    
                const formatedPath: string = licenseId.toString();

                const messageMediaLicense: string = await this.insertManyMediasIntoLicense(newLicense.mediaList, licenseId, conn);
                const messageSelectonLicense: string = await this.insertManySelectionsIntoLicense(newLicense.selectionList, licenseId, conn);
                const messageSrcIcon: string = await this.posterService.insertPosterLicense(newLicense.srcIcon, formatedPath, licenseId, 'srcIcon', conn);
                const messageSrcLogo: string = await this.posterService.insertPosterLicense(newLicense.srcLogo, formatedPath, licenseId, 'srcLogo', conn);
                const messageSrcBackground: string = await this.posterService.insertPosterLicense(newLicense.srcBackground, formatedPath, licenseId, 'srcBackground', conn);

                await conn.commit();
                returnMessage = {
                    id: 1,
                    state: true,
                    message: `${this.i18nService.t("common.LICENSE.LICENSE_INSERTED")} \n ${messageMediaLicense} \n ${messageSelectonLicense} \n ${messageSrcIcon} \n ${messageSrcLogo} \n ${messageSrcBackground}`,
                    other: { id: licenseId }
                }

            } catch (error: any) {
                await conn.rollback();
                returnMessage = {
                    id: -1,
                    state: false,
                    message: `${this.i18nService.t("common.ERROR")} : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnMessage = {
                id: -1,
                state: false,
                message: this.i18nService.t("common.LICENSE.NAME_FIELD_CANNOT_BLANK")
            }
        }
        return returnMessage;
    }

    public async updateLicense(updateLicense: EditLicense): Promise<ReturnMessage> {
        let returnMessage !: ReturnMessage;
        if (updateLicense.name && updateLicense.name.trim() != "") {
            const conn = await this.pool.getConnection();
            try {
                const oldLicense: License = await this.getEntirelyLicenseById(-1, updateLicense.id);
                if (oldLicense && oldLicense.id) {
                    const formatedPath: string = oldLicense.id.toString();
                    const queryUpdate: string = `UPDATE LICENSE 
                        SET name = ?,
                        position = ?
                        WHERE id = ?`
                    await conn.query(queryUpdate, [updateLicense.name.trim(), updateLicense.position ? 1 : 0, updateLicense.id]);
                    const messageSrcIcon: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcIcon, oldLicense.srcIcon, formatedPath, 'srcIcon', conn);
                    const messageSrcLogo: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcLogo, oldLicense.srcLogo, formatedPath, 'srcLogo', conn);
                    const messageSrcBackground: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcBackground, oldLicense.srcBackground, formatedPath, 'srcBackground', conn);
                    await conn.query(`DELETE FROM License_Media WHERE licenseId = ?`, [updateLicense.id]);
                    await conn.query(`DELETE FROM License_Selection WHERE licenseId = ?`, [updateLicense.id]);
                    const messageMediaLicense: string = await this.insertManyMediasIntoLicense(updateLicense.mediaList, updateLicense.id, conn);
                    const messageSelectonLicense: string = await this.insertManySelectionsIntoLicense(updateLicense.selectionList, updateLicense.id, conn);

                    await conn.commit();
                    returnMessage = {
                        id: 1,
                        state: true,
                        message: `${this.i18nService.t("common.LICENSE.LICENSE_UPDATED")} \n ${messageMediaLicense} \n ${messageSelectonLicense} \n ${messageSrcIcon} \n ${messageSrcLogo} \n ${messageSrcBackground}`,
                        other: { id: updateLicense.id }
                    }
                } else {
                    returnMessage = {
                        id: -1,
                        state: false,
                        message: this.i18nService.t("common.LICENSE.LICENSE_UNFOUND")
                    }
                }
            } catch (error: any) {
                await conn.rollback();
                returnMessage = {
                    id: -1,
                    state: false,
                    message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnMessage = {
                id: -1,
                state: false,
                message: this.i18nService.t("common.LICENSE.NAME_FIELD_CANNOT_BLANK")
            }
        }
        return returnMessage;
    }

    public async updateOrderLicenseByPosition(licenseIds: number[], position: number): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            let message: string = '';
            const licenses: License[] = await conn.query(`SELECT id, name FROM LICENSE WHERE position = ?`, [position]);
            if (licenses.length > 0) {
                const licensesByPostion: number[] = licenseIds.filter((id) => licenses.some((license: License) => license.id === id));
                for (const [index, licenseId] of licensesByPostion.entries()) {
                    const query: string = `UPDATE License SET orderIndex = ? WHERE id = ?`;
                    await conn.query(query, [index, licenseId]);
                    const name: string = licenses.find((license: License) => license.id === licenseId).name;
                    message += `${name} => ${index} \n`;
                }
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: message
                }
            } else {
                return {
                    id: 1,
                    state: true,
                    message: this.i18nService.t("common.LICENSE.NO_CHANGES")
                }
            }
        } catch (error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t("common.ERROR")}:  ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async deleteLicenseById(licenceId: number): Promise<ReturnMessage> {
        let returnMessage !: ReturnMessage;
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const resultDeleteLicenseMedia = await conn.query(`DELETE FROM License_Media WHERE licenseId = ?`, [licenceId]);
            const resultDeleteLicenseSelection = await conn.query(`DELETE FROM License_Selection WHERE licenseId = ?`, [licenceId]);
            const resultDeletePoster = await this.posterService.deleteAllPostersLinkedToLicense(licenceId, conn);
            await conn.query(`DELETE FROM License WHERE id = ?`, [licenceId]);
            await conn.commit();
            returnMessage = {
                id: -1,
                state: true,
                message: `${this.i18nService.t("common.LICENSE.LICENSE_DELETED")} \n ${resultDeleteLicenseMedia.affectedRows} \n ${resultDeleteLicenseSelection.affectedRows} \n ${resultDeletePoster}`
            }
        } catch (error: any) {
            await conn.rollback();
            returnMessage = {
                id: -1,
                state: false,
                message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
        return returnMessage;
    }

    private async insertManyMediasIntoLicense(medias: number[], licenseId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const values: any[] = [];
            if (medias.length > 0) {
                medias.forEach((media: number, index) => {
                    values.push(licenseId, media, index);
                });
                const query: string = `
                        INSERT INTO License_Media (licenseId, mediaId, orderIndex)
                        VALUES ${medias.map(() => '(?, ?, ?)').join(', ')}`;
                await conn.query(query, values);
                return this.i18nService.t('common.LICENSE.COUNT_MEDIA_ADDED_INTO_LICENSE', {
                    args: {
                        count: medias.length
                    }
                });
            } else {
                return this.i18nService.t('common.LICENSE.NO_MEDIA_ADDED_INTO_LICENSE');
            }
        } catch (error) {
            throw error;
        }
    }

    private async insertManySelectionsIntoLicense(selections: number[], licenseId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const values: any[] = [];
            if (selections.length > 0) {
                selections.forEach((selection: number, index) => {
                    values.push(licenseId, selection, index);
                });
                const query: string = `
                        INSERT INTO License_Selection (licenseId, selectionId, orderIndex)
                        VALUES ${selections.map(() => '(?, ?, ?)').join(', ')}`;
                await conn.query(query, values);
                return this.i18nService.t('common.LICENSE.COUNT_SELECTION_ADDED_INTO_LICENSE', {
                    args: {
                        count: selections.length
                    }
                });
            } else {
                return this.i18nService.t('common.LICENSE.NO_SELECTION_ADDED_INTO_LICENSE');
            }
        } catch (error) {
            throw error;
        }
    }

}
