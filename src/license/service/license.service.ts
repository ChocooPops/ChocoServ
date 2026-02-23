import { Injectable, Inject } from '@nestjs/common';
import { License } from '../dto/license.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditLicense } from '../dto/edit-license.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import { PosterService } from 'src/poster/service/poster.service';
import { FormatPathService } from 'src/common-service/format-path.service';
import * as mariadb from 'mariadb';
import { MediaType } from 'src/media/dto/media-type.enum';
import { SearchItem } from 'src/common-interface/search-item.interface';
import { SearchService } from 'src/common-service/search.service';
import { Media } from 'src/media/dto/media.interface';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { SelectionService } from 'src/selection/service/selection.service';
import { Selection } from 'src/selection/dto/selection.interface';
import { MediaService } from 'src/media/service/media.service';
import { Graph } from 'src/common-interface/graph.intrface';
import { Node } from 'src/common-interface/node.interface';
import { Link } from 'src/common-interface/link.interface';
import { UploadImageService } from 'src/common-service/upload-image.service';

@Injectable()
export class LicenseService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly formatPathService: FormatPathService,
        private readonly posterService: PosterService,
        private readonly searchService: SearchService,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly selectionService: SelectionService,
        private readonly uploadImageService: UploadImageService) { }

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
        formatedLicense.srcIcon = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.name, MediaType.LICENSE, formatedLicense.srcIcon);
        formatedLicense.srcLogo = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.name, MediaType.LICENSE, formatedLicense.srcLogo);
        formatedLicense.srcBackground = this.formatPathService.getOneFormatedPosterUrl(formatedLicense.name, MediaType.LICENSE, formatedLicense.srcBackground);
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
            const items: SearchItem[] = await conn.query(`SELECT id, name as title FROM License;`);
            const licenseIds: number[] = this.searchService.getItemByResearch(keyWord, items);
            if (licenseIds.length > 0) {
                const WHERE: string = `WHERE l.id IN (${licenseIds.map(() => '?').join(', ')})`;
                const ORDER: string = `ORDER BY FIELD (l.id, ${licenseIds.map(() => '?').join(', ')})`;
                const query: string = this.getQuerySelectSimpleLicense(WHERE, ORDER);
                const licenses: License[] = await conn.query(query, [...licenseIds, ...licenseIds]);
                licenses.forEach((license: License, index) => {
                    licenses[index] = this.getFormatedLicense(license);
                });
                return licenses;
            } else {
                return [];
            }
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
                if (!(await this.getIfLicenseNameExist(newLicense.name, -1, conn))) {
                    const formatedTitle: string = this.formatPathService.formatPath(newLicense.name);
                    const maxLicense = await conn.query('Select count(id) as orderIndex FROM License');
                    const newOrderIndex = maxLicense[0]?.orderIndex !== null ? Number(maxLicense[0].orderIndex) + 1 : 1000;
                    const queryInsertLicense: string = `INSERT INTO License (name, position, orderIndex) VALUES (?, ?, ?)`;
                    const resultInsertLicense = await conn.query(queryInsertLicense, [newLicense.name.trim(), newLicense.position ? 1 : 0, newOrderIndex]);
                    const licenseId: number = Number(resultInsertLicense.insertId);

                    const messageMediaLicense: string = await this.insertManyMediasIntoLicense(newLicense.mediaList, licenseId, conn);
                    const messageSelectonLicense: string = await this.insertManySelectionsIntoLicense(newLicense.selectionList, licenseId, conn);
                    const messageSrcIcon: string = await this.posterService.insertPosterLicense(newLicense.srcIcon, formatedTitle, licenseId, 'srcIcon', conn);
                    const messageSrcLogo: string = await this.posterService.insertPosterLicense(newLicense.srcLogo, formatedTitle, licenseId, 'srcLogo', conn);
                    const messageSrcBackground: string = await this.posterService.insertPosterLicense(newLicense.srcBackground, formatedTitle, licenseId, 'srcBackground', conn);

                    await conn.commit();
                    returnMessage = {
                        id: 1,
                        state: true,
                        message: `License insérée \n ${messageMediaLicense} \n ${messageSelectonLicense} \n ${messageSrcIcon} \n ${messageSrcLogo} \n ${messageSrcBackground}`,
                        other: { id: licenseId }
                    }
                } else {
                    returnMessage = {
                        id: -1,
                        state: false,
                        message: "Une licence possède déjà ce nom, doublon impossible"
                    }
                }
            } catch (error) {
                await conn.rollback();
                returnMessage = {
                    id: -1,
                    state: false,
                    message: `Erreur : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnMessage = {
                id: -1,
                state: false,
                message: "Le nom de doit pas être vide"
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
                    if (!(await this.getIfLicenseNameExist(updateLicense.name, updateLicense.id, conn))) {
                        const formatedTitle: string = this.formatPathService.formatPath(oldLicense.name);
                        const queryUpdate: string = `UPDATE LICENSE 
                            SET name = ?,
                            position = ?
                            WHERE id = ?`
                        await conn.query(queryUpdate, [updateLicense.name.trim(), updateLicense.position ? 1 : 0, updateLicense.id]);
                        const messageSrcIcon: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcIcon, oldLicense.srcIcon, formatedTitle, 'srcIcon', conn);
                        const messageSrcLogo: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcLogo, oldLicense.srcLogo, formatedTitle, 'srcLogo', conn);
                        const messageSrcBackground: string = await this.posterService.modifyOrDeletePosterFromLicense(updateLicense.id, updateLicense.srcBackground, oldLicense.srcBackground, formatedTitle, 'srcBackground', conn);
                        await conn.query(`DELETE FROM License_Media WHERE licenseId = ?`, [updateLicense.id]);
                        await conn.query(`DELETE FROM License_Selection WHERE licenseId = ?`, [updateLicense.id]);
                        const messageMediaLicense: string = await this.insertManyMediasIntoLicense(updateLicense.mediaList, updateLicense.id, conn);
                        const messageSelectonLicense: string = await this.insertManySelectionsIntoLicense(updateLicense.selectionList, updateLicense.id, conn);

                        const newFormatedTitle: string = this.formatPathService.formatPath(updateLicense.name);
                        if (newFormatedTitle != formatedTitle) {
                            await this.uploadImageService.renameFileOrDirectorToLicense(formatedTitle, newFormatedTitle);
                        }
                        await conn.commit();
                        returnMessage = {
                            id: 1,
                            state: true,
                            message: `License insérée \n ${messageMediaLicense} \n ${messageSelectonLicense} \n ${messageSrcIcon} \n ${messageSrcLogo} \n ${messageSrcBackground}`,
                            other: { id: updateLicense.id }
                        }
                    } else {
                        returnMessage = {
                            id: -1,
                            state: false,
                            message: "Le nom de la license existe déjà (doublon impossible)"
                        }
                    }
                } else {
                    returnMessage = {
                        id: -1,
                        state: false,
                        message: "License introuvable"
                    }
                }
            } catch (error) {
                await conn.rollback();
                returnMessage = {
                    id: -1,
                    state: false,
                    message: `Erreur : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnMessage = {
                id: -1,
                state: false,
                message: "Le nom de doit pas être vide"
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
        } catch (error) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur :  ${error.sqlMessage}`
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
                message: `License supprimée avec succès \n ${resultDeleteLicenseMedia.affectedRows} \n ${resultDeleteLicenseSelection.affectedRows} \n ${resultDeletePoster}`
            }
        } catch (error) {
            await conn.rollback();
            returnMessage = {
                id: -1,
                state: false,
                message: `Erreur : ${error.sqlMessage}`
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
                return `${medias.length} media ont été ajouté dans la license`;
            } else {
                return "Aucun media n'est à ajouter dans la license";
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
                return `${selections.length} sélections ont été ajouté dans la license`;
            } else {
                return "Aucune sélection n'est à ajouter dans la license";
            }
        } catch (error) {
            throw error;
        }
    }

    protected async getIfLicenseNameExist(title: string, id: number, conn: mariadb.PoolConnection): Promise<boolean> {
        try {
            const formatedTitle: string = this.formatPathService.formatPath(title);
            const query = `SELECT name from License WHERE id != ?;`
            const result: any[] = await conn.query(query, [id]);
            const medias: any[] = result.filter((item) => this.formatPathService.formatPath(item.name) === formatedTitle);
            if (medias.length > 0) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            throw error;
        }
    }

}
