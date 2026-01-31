import { Inject, Injectable } from '@nestjs/common';
import { FormatPathService } from 'src/common-service/format-path.service';
import { ProfilPhoto } from '../dto/profil-photo.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { join } from 'path';
import { readdirSync } from 'fs';

@Injectable()
export class ProfilPhotoService {

    private readonly Table: string = 'Profil_Photo';
    private readonly folderUploads: string = 'uploads';
    private readonly folderProfilPhoto: string = 'profil-photo';
    private readonly imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.jfif'];

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private formatPathService: FormatPathService) {
        this.folderUploads = this.formatPathService.getFolderUploads();
    }

    public async getProfilPhotoById(id: number): Promise<ProfilPhoto | null> {
        try {
            const query: string = `
            SELECT id, name from ${this.Table}
            Where id = ?`;
            const photo: ProfilPhoto = await this.pool.query(query, [id]);
            return photo[0] ?? null;
        } catch (error) {
            return null;
        }
    }

    public async getRandomProfilPhoto(): Promise<ProfilPhoto | null> {
        try {
            const query: string = `
            SELECT id, name from ${this.Table}
            ORDER BY RAND()
            LIMIT 1`;
            const photo: ProfilPhoto = await this.pool.query(query);
            return photo[0] ?? null;
        } catch (error) {
            return null;
        }
    }

    public async getAllProfilPicture(): Promise<ProfilPhoto[]> {
        const conn = await this.pool.getConnection();
        try {
            const photos: ProfilPhoto[] = await conn.query(`SELECT id, name from Profil_Photo;`);
            photos.forEach((photo: ProfilPhoto) => {
                photo.name = this.formatPathService.getUrlProfilPhoto(photo.name);
            });
            return photos;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async fillAllProfilPictureData(): Promise<any> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const pictureInserted: string[] = [];
            const pictureDeleted: string[] = [];
            const pictureSaved: ProfilPhoto[] = await conn.query(
                `SELECT id, name FROM profil_photo`
            );
            const folderPath = join(
                __dirname,
                '../../../',
                this.folderUploads,
                this.folderProfilPhoto
            );
            const files = readdirSync(folderPath);
            const imageFilesFiltered = files.filter(file => {
                const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
                return this.imageExtensions.includes(ext);
            });
            const dbNamesSet = new Set(pictureSaved.map(p => p.name));
            const folderNamesSet = new Set(imageFilesFiltered);
            const postersToDelete = pictureSaved.filter(
                photo => !folderNamesSet.has(photo.name)
            );

            const postersToInsert = imageFilesFiltered.filter(
                fileName => !dbNamesSet.has(fileName)
            );
            if (postersToInsert.length > 0) {
                const sql = `
                    INSERT INTO profil_photo (name)
                    VALUES ${postersToInsert.map(() => '(?)').join(', ')}`;
                await conn.query(sql, postersToInsert);
                pictureInserted.push(...postersToInsert);
            }
            if (postersToDelete.length > 0) {
                const sql = `
                    DELETE FROM profil_photo
                    WHERE id IN (${postersToDelete.map(() => '?').join(', ')})`;
                await conn.query(
                    sql,
                    postersToDelete.map(item => item.id)
                );
                pictureDeleted.push(
                    ...postersToDelete.map(item => `${item.id} : ${item.name}`)
                );
            }
            await conn.commit();
            return {
                pictureDeleted: pictureDeleted,
                pictureInserted: pictureInserted
            }
        } catch (error) {
            await conn.rollback();
            return error;
        } finally {
            await conn.release();
        }
    }

}
