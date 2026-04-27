import { Injectable } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { Job } from '../dto/job.enum';
import { Credit } from '../dto/credit.interface';

@Injectable()
export class CreditService {


    public getJobToFilters(): Job[] {
        return [
            Job.ACTOR,
            Job.DIRECTOR,
            Job.PRODUCER,
            Job.DIRECTOR_OF_PHOTOGRAPHY,
            Job.ORIGINAL_MUSIC_COMPOSER,
            Job.WRITER,
            Job.STORY,
            Job.SCREENPLAY,
            Job.COMIC_BOOK,
            Job.VISUAL_EFFECTS_TECHNICAL_DIRECTOR
        ]
    }

    public async insertManyStaff(mediaId: number, credits: Credit[], conn: mariadb.PoolConnection): Promise<string> {
        // if (actors.length > 0 || directors.length > 0) {
        //     try {
        //         const actorsFormated = await this.getStaffNotInserted(actors, Job.ACTOR, conn);
        //         const directorsFormated = await this.getStaffNotInserted(directors, Job.DIRECTOR, conn);
        //         const valuesStaff: any[] = [];
        //         actorsFormated.newStaff.forEach((item) => {
        //             valuesStaff.push(item);
        //             valuesStaff.push(Job.ACTOR);
        //         });
        //         directorsFormated.newStaff.forEach((item) => {
        //             valuesStaff.push(item);
        //             valuesStaff.push(Job.DIRECTOR);
        //         });

        //         let insertedIds: number[] = [];
        //         const valuesMediaStaff: any[] = [];
        //         if (valuesStaff.length > 0) {
        //             const queryInsert: string = `
        //             INSERT INTO Staff (fullName, job)
        //             VALUES ${actorsFormated.newStaff.map(() => '(?, ?)').join(', ')}
        //             ${actorsFormated.newStaff.length > 0 && directorsFormated.newStaff.length > 0 ? this.getComma(actorsFormated.newStaff) : ''} 
        //             ${directorsFormated.newStaff.map(() => '(?, ?)').join(', ')}`;

        //             const resultStaffInsert = await conn.query(queryInsert, valuesStaff);
        //             const startIdNumber = Number(resultStaffInsert.insertId);
        //             const count = Number(resultStaffInsert.affectedRows);
        //             insertedIds = Array.from({ length: count }, (_, i) => startIdNumber + i);
        //             insertedIds.forEach(id => {
        //                 valuesMediaStaff.push(mediaId);
        //                 valuesMediaStaff.push(id);
        //             });
        //         }

        //         actorsFormated.oldId.forEach((item) => {
        //             valuesMediaStaff.push(mediaId);
        //             valuesMediaStaff.push(item);
        //         });
        //         directorsFormated.oldId.forEach((item) => {
        //             valuesMediaStaff.push(mediaId);
        //             valuesMediaStaff.push(item);
        //         });

        //         const resultMediaStuffInsert = await conn.query(`
        //             INSERT INTO Media_Staff (mediaId, staffId)
        //             VALUES 
        //             ${insertedIds.length > 0 ? insertedIds.map(() => '(?, ?)').join(', ') : ''} ${insertedIds.length > 0 ? this.getComma([...actorsFormated.oldId, ...directorsFormated.oldId]) : ''} 
        //             ${actorsFormated.oldId.map(() => '(?, ?)').join(', ')} ${actorsFormated.oldId.length > 0 ? this.getComma(directorsFormated.oldId) : ''} 
        //             ${directorsFormated.oldId.map(() => '(?, ?)').join(', ')}`, valuesMediaStaff);

        //         return `Les acteurs et/ou réalisateur ont été ajoutés (${resultMediaStuffInsert.affectedRows})`;
        //     } catch (error) {
        //         throw error;
        //     }
        // } else {
        //     return "Aucun acteur ou réalisateur n'est à ajouter";
        // }
        return '';
    }

    public async deleteAndUpdateMediaStaff(mediaId: number, credits: Credit[], conn: mariadb.PoolConnection): Promise<string> {
        // try {
        //     await conn.query(`DELETE FROM Media_Staff WHERE mediaId = ?`, [mediaId]);
        //     return await this.insertManyStaff(mediaId, actors, directors, conn);
        // } catch (error) {
        //     throw error;
        // }
        return '';
    }

    private async getStaffNotInserted(fullName: string[], job: Job, conn: mariadb.PoolConnection): Promise<{ oldId: number[], newStaff: string[] }> {
        // if (fullName.length > 0) {
        //     const query: string = `
        //     SELECT id, fullName from Staff
        //     WHERE  fullName IN (${fullName.map(() => `?`).join(', ')}) AND job = ?`;
        //     const result: any[] = await conn.query(query, [...fullName, job]);
        //     return {
        //         oldId: result ? result.map((item) => item.id) || [] : [],
        //         newStaff: fullName.filter(item => !result?.some((item2 => item2.fullName === item))) || []
        //     }
        // } else {
        //     return {
        //         oldId: [],
        //         newStaff: []
        //     }
        // }
        return {
            oldId: [],
            newStaff: []
        }
    }

    private getComma(tab: any[]): string {
        if (tab && tab.length > 0) {
            return ', ';
        } else {
            return '';
        }
    }

}
