import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CategoryEntirely } from '../dto/categoryEntirely.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { Category } from '../dto/category.interface';
import { CategorySimple } from '../dto/categorySimple.interface';
import * as mariadb from 'mariadb';
import { DATABASE_POOL } from 'src/database/database.module';
import { Media } from 'src/media/dto/media.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { Movie } from 'src/movie/dto/movie.interface';
import { Series } from 'src/series/dto/series.interface';
import { MediaService } from 'src/media/service/media.service';
import { Link } from 'src/common-interface/link.interface';
import { Graph } from 'src/common-interface/graph.intrface';
import { Node } from 'src/common-interface/node.interface';

@Injectable()
export class CategoryService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly mediaService: MediaService,
        @Inject(forwardRef(() => MovieService))
        private readonly movieService: MovieService,
        @Inject(forwardRef(() => SeriesService))
        private readonly seriesService: SeriesService) { }

    public async getGraphCategory(): Promise<Graph> {
        const conn = await this.pool.getConnection();
        try {
            const nodes: Node[] = await conn.query(`Select id, name FROM Category`);
            const links: Link[] = await conn.query(`Select categoryId as source, mediaId as target FROM Media_Category`);
            return {
                nodes: nodes,
                links: links
            }
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectCategory(ORDER_MEDIA: string, WHERE: string, HAVING: string, ORDER: string, LIMIT: string): string {
        return `
            SELECT 
            JSON_OBJECT(
                'id', c.id,
                'name', c.name,
                'nameSelection', c.nameSelection,
                'medias', ${this.mediaService.getQuerySelectManyMedia(ORDER_MEDIA)}
            ) AS category
        FROM category c
        LEFT JOIN media_category mec ON mec.categoryId = c.id
        LEFT JOIN media m ON m.id = mec.mediaId
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        GROUP BY c.id
        ${HAVING}
        ${ORDER}
        ${LIMIT}`
    }

    private getFormatedCategoryWithDifferentiatedMedia(category: any): CategoryEntirely {
        const formatedCategory: any = category.category ? category.category : category;
        const movies: Movie[] = [];
        const series: Series[] = [];
        formatedCategory.medias.forEach((media: Media) => {
            if (media.mediaType === MediaType.MOVIE) {
                movies.push(this.movieService.getFormatedMovie(media));
            } else if (media.mediaType === MediaType.SERIES) {
                series.push(this.seriesService.getFormatedSeries(media));
            }
        });
        return {
            id: formatedCategory.id,
            name: formatedCategory.name,
            nameSelection: formatedCategory.nameSelection,
            movies: movies,
            series: series
        };
    }

    private getFormatedCategoryWithMedia(category: any): CategoryEntirely {
        const formatedCategory: any = category.category ? category.category : category;
        const medias: Media[] = [];
        formatedCategory.medias.forEach((media: Media) => {
            if (media.mediaType === MediaType.MOVIE) {
                medias.push(this.movieService.getFormatedMovie(media));
            } else if (media.mediaType === MediaType.SERIES) {
                medias.push(this.seriesService.getFormatedSeries(media));
            }
        });
        return {
            id: formatedCategory.id,
            name: formatedCategory.name,
            nameSelection: formatedCategory.nameSelection,
            movies: [],
            series: [],
            medias: medias
        };
    }

    public async getAllCategories(): Promise<CategorySimple[]> {
        try {
            const query = 'SELECT id, name from Category';
            return await this.pool.query(query);
        } catch (error) {
            return [];
        }
    }

    public async getCategoryById(id: number): Promise<CategoryEntirely> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectCategory(``, `WHERE c.id = ?`, ``, ``, ``);
            const category: any[] = await conn.query(query, [-1, id]);
            category[0] = this.getFormatedCategoryWithDifferentiatedMedia(category[0]);
            return category[0];
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async getCategoriesWithMedia(userId: number, mediaType: MediaType): Promise<CategoryEntirely[]> {
        const conn = await this.pool.getConnection();
        try {
            const ORDER_MEDIA: string = `ORDER BY RAND() LIMIT 30`;
            const WHERE: string = `WHERE m.mediaType = ?`;
            const HAVING: string = `HAVING COUNT(mec.categoryId) > 9`;
            const ORDER: string = `ORDER BY RAND()`;
            const LIMIT: string = `LIMIT 6`;
            const query: string = this.getQuerySelectCategory(ORDER_MEDIA, WHERE, HAVING, ORDER, LIMIT);
            const categories: CategoryEntirely[] = await conn.query(query, [userId, mediaType]);
            categories.forEach((category: CategoryEntirely, index) => {
                categories[index] = this.getFormatedCategoryWithMedia(category);
            });
            return categories;
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    async insertNewCategory(newCategory: Category): Promise<ReturnMessage> {
        let returnedMessage !: ReturnMessage;
        if (newCategory.name && newCategory.name.trim() !== '' && newCategory.nameSelection && newCategory.nameSelection.trim() !== '') {
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const queryInsertSelection: string = `
                INSERT INTO Category (name, nameSelection)
                VALUES (?, ?);`;
                const resultInsertSelection = await conn.query(queryInsertSelection, [newCategory.name.trim(), newCategory.nameSelection.trim()]);
                const categoryId: number = Number(resultInsertSelection.insertId);
                const messageMediaSelection: string = await this.insertManyMediasIntoCategory([...newCategory.movies, ...newCategory.series], categoryId, conn);
                await conn.commit();
                returnedMessage = {
                    id: 1,
                    state: true,
                    message: `Categorie insérée avec succès \n ${messageMediaSelection}`,
                    other: {
                        id: categoryId,
                        name: newCategory.name
                    }
                }
            } catch (error) {
                await conn.rollback();
                returnedMessage = {
                    id: -1,
                    state: false,
                    message: `Erreur : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnedMessage = {
                id: -1,
                state: false,
                message: `Le nom de la categorie ne doit pas être vide`
            }
        }
        return returnedMessage;
    }

    async updateCategoryById(categoryUpdated: Category): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const category: CategoryEntirely = await this.getCategoryById(categoryUpdated.id);
            if (category && category.id) {
                const name: string = categoryUpdated.name && categoryUpdated.name.trim() !== '' ? categoryUpdated.name : category.name;
                const nameSelection: string = categoryUpdated.nameSelection && categoryUpdated.nameSelection.trim() !== '' ? categoryUpdated.nameSelection : category.nameSelection;
                const queyUpdateCategory: string = `
                    UPDATE Category
                    SET name = ?, nameSelection = ? 
                    WHERE id = ?`;
                await conn.query(queyUpdateCategory, [name.trim(), nameSelection.trim(), categoryUpdated.id]);
                await conn.query('DELETE FROM Media_Category WHERE categoryId = ?', [categoryUpdated.id]);
                const messageMediaSelection: string = await this.insertManyMediasIntoCategory([...categoryUpdated.movies, ...categoryUpdated.series], categoryUpdated.id, conn);
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: `Categorie modifiée avec succès \n ${messageMediaSelection}`,
                    other: {
                        id: category.id,
                        name: categoryUpdated.name
                    }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: "Categorie introuvable"
                }
            }
        } catch (error) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `Erreur : ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    async deleteCategory(categoryId: number): Promise<ReturnMessage> {
        let returnMessage !: ReturnMessage;
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM Media_Category WHERE categoryId = ?', [categoryId]);
            await conn.query('DELETE FROM Category WHERE id = ?', [categoryId]);
            await conn.commit();
            returnMessage = {
                id: 1,
                state: true,
                message: 'Categorie supprimée avec succès',
                other: categoryId
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

    private async insertManyMediasIntoCategory(medias: number[], categoryId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const values: any[] = [];
            if (medias.length > 0) {
                medias.forEach((media: number) => {
                    values.push(categoryId, media);
                });
                const query: string = `
                        INSERT INTO Media_Category (categoryId, mediaId)
                        VALUES ${medias.map(() => '(?, ?)').join(', ')}`;
                await conn.query(query, values);
                return `${medias.length} media ont été ajouté dans la categorie`;
            } else {
                return "Aucun media n'est à ajouter dans la categorie";
            }
        } catch (error) {
            throw error;
        }
    }
}
