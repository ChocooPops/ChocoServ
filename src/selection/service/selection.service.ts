import { Injectable, Inject } from '@nestjs/common';
import { Selection } from '../dto/selection.interface';
import { EditSelection } from '../dto/edit-selection.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { SelectionType } from '../dto/selection-type.enum';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { Media } from 'src/media/dto/media.interface';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Graph } from 'src/common-interface/graph.intrface';
import { Node } from 'src/common-interface/node.interface';
import { Link } from 'src/common-interface/link.interface';
import { PageType } from '../dto/page-type.enum';
import { CategoryService } from 'src/category/service/category.service';
import { CategoryEntirely } from 'src/category/dto/categoryEntirely.interface';
import { StatUserService } from 'src/stat-user/service/stat-user.service';
import { MediaService } from 'src/media/service/media/media.service';
import { I18nService } from 'nestjs-i18n';
import { SearchService } from 'src/common-service/search.service';

@Injectable()
export class SelectionService {

    constructor(@Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
        private readonly mediaService: MediaService,
        private readonly movieService: MovieService,
        private readonly seriesService: SeriesService,
        private readonly categoryService: CategoryService,
        private readonly statUserService: StatUserService,
        private readonly i18nService: I18nService,
        private readonly searchService: SearchService) { }

    public async getGraphSelection(): Promise<Graph> {
        const conn = await this.pool.getConnection();
        try {
            const nodes: Node[] = await conn.query(`SELECT id, name FROM Selection`);
            const links: Link[] = await conn.query(`SELECT selectionId as source, mediaId as target FROM Selection_Media`);
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

    private getQuerySimpleSelections(WHERE: string, ORDER: string): string {
        return `
        SELECT id, name, selectionType 
        FROM Selection
        ${WHERE}
        ${ORDER};`
    }

    private getQuerySelections(JOIN: string, WHERE: string, ORDER: string): string {
        return `
        SELECT 
            JSON_OBJECT(
                'id', sel.id,
                'name', sel.name,
                'selectionType', sel.selectionType,
                'mediaList', ${this.mediaService.getQuerySelectManyMedia(`ORDER BY sm.orderIndex asc`)}
            ) AS selection
        FROM selection sel
        ${JOIN}
        LEFT JOIN selection_media sm ON sm.selectionId = sel.id
        LEFT JOIN media m ON m.id = sm.mediaId
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        GROUP BY sel.id
        ${ORDER}`;
    }

    public getFormatedSelection(selection: any): Selection {
        const selectionFormated: Selection = selection.selection ? selection.selection : selection;
        if (selectionFormated.mediaList) {
            selectionFormated.mediaList.forEach((media: Media, index) => {
                if (media.mediaType === MediaType.MOVIE) {
                    selectionFormated.mediaList[index] = this.movieService.getFormatedMovie(media);
                } else if (media.mediaType === MediaType.SERIES) {
                    selectionFormated.mediaList[index] = this.seriesService.getFormatedSeries(media);
                }
            });
        } else {
            selectionFormated.mediaList = [];
        }
        return selectionFormated;
    }

    public async getSelectionsForHomePage(userId: number): Promise<Selection[]> {
        const conn = await this.pool.getConnection();
        try {
            const selectionInProgress: Selection = await this.statUserService.getMediaSelectionInProgess(userId, conn);
            const query: string = this.getQuerySelections(
                `INNER JOIN Selection_Page selp ON selp.selectionId = sel.id`,
                `WHERE selp.pageType = ?`,
                `ORDER BY selp.orderIndex asc`);
            const selections: any[] | null = await conn.query(query, [userId, userId, PageType.HOME]);
            selections.forEach((selection: Selection, index) => {
                selections[index] = this.getFormatedSelection(selection);
            });
            if(selectionInProgress && selectionInProgress.mediaList.length > 0) {
                return [selectionInProgress, ...selections];
            } else {
                return selections;
            }
        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async createMediaSelectionsByTypeFromCategoryByCount(userId: number, mediaType: MediaType): Promise<Selection[]> {
        const selections: Selection[] = [];
        const categories: CategoryEntirely[] = await this.categoryService.getCategoriesWithMedia(userId, mediaType);
        categories.forEach((category: CategoryEntirely) => {
            selections.push({
                id: category.id,
                name: category.nameSelection,
                selectionType: SelectionType.NORMAL_POSTER,
                mediaList: category.medias || []
            })
        });
        return selections;
    }

    public async getSelectionByResearched(keyWord: string): Promise<Selection[]> {
        const conn = await this.pool.getConnection();
        try {
            const normalizedKeyword = this.searchService.normalizedKeyword(keyWord);
            const keywords = normalizedKeyword.split(' ').filter(Boolean);

            const likeConditions = keywords
                .map(() => `name LIKE ?`)
                .join(' AND ');

            const WHERE: string = `WHERE ${likeConditions}`;
            const ORDER: string = `ORDER BY CHAR_LENGTH(name) ASC`;

            const query: string = this.getQuerySimpleSelections(WHERE, ORDER);
            const likeParams = keywords.map(k => `%${k}%`);

            const results: Selection[] = await conn.query(query, [...likeParams]);

            if (results.length < 10) {
                const WHERE_ALL: string = `WHERE 1=1`;
                const allSelections: Selection[] = await conn.query(
                    this.getQuerySimpleSelections(WHERE_ALL, ORDER), []
                );

                const likeIds = new Set(results.map(r => r.id));
                const fuzzy = allSelections.filter(s => {
                    if (!s.name || likeIds.has(s.id)) return false;
                    const normalizedName = this.searchService.normalizedKeyword(s.name);
                    return normalizedName.split(' ').some(word =>
                        keywords.some(k => {
                            const distance = this.searchService.levenshteinDistance(word, k);
                            const maxDistance = this.searchService.getMaxDistance();
                            return distance <= maxDistance;
                        })
                    );
                });

                const allResults = [...results, ...fuzzy];
                allResults.forEach(s => s.mediaList = []);
                return allResults.slice(0, 10);
            }

            results.forEach(s => s.mediaList = []);
            return results.slice(0, 10);

        } catch (error) {
            return [];
        } finally {
            await conn.release();
        }
    }

    public async getSelectionById(id: number): Promise<Selection> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelections(``, `WHERE sel.id = ?`, ``);
            const result = await conn.query(query, [-1, -1, id]);
            return this.getFormatedSelection(result[0]);
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    public async insertNewSelection(newSelection: EditSelection): Promise<ReturnMessage> {
        let returnedMessage !: ReturnMessage;
        if (newSelection.name && newSelection.name.trim() !== '') {
            const conn = await this.pool.getConnection();
            try {
                await conn.beginTransaction();
                const queryInsertSelection: string = `
                    INSERT INTO Selection (name, selectionType)
                    VALUES (?, ?);`;
                const resultInsertSelection = await conn.query(queryInsertSelection, [newSelection.name.trim(), newSelection.selectionType || SelectionType.NORMAL_POSTER]);
                const selectionId: number = Number(resultInsertSelection.insertId);
                const messageMediaSelection: string = await this.insertManyMediasIntoSelection(newSelection.mediaList, selectionId, conn);
                await conn.commit();
                returnedMessage = {
                    id: 1,
                    state: true,
                    message: `${this.i18nService.t("common.SELECTION.SELECTION_ADDED")} \n ${messageMediaSelection}`,
                    other: { id: selectionId }
                }
            } catch (error: any) {
                await conn.rollback();
                returnedMessage = {
                    id: -1,
                    state: false,
                    message: `${this.i18nService.t("common.ERROR")} : ${error.sqlMessage}`
                }
            } finally {
                await conn.release();
            }
        } else {
            returnedMessage = {
                id: -1,
                state: false,
                message: this.i18nService.t("common.SELECTION.SELECTION_NAME_NOT_BLANK")
            }
        }
        return returnedMessage;
    }

    public async updateSelection(updatedSelection: EditSelection): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const selection: Selection = await this.getSelectionById(updatedSelection.id);
            if (selection && selection.id) {
                const name: string = updatedSelection.name && updatedSelection.name.trim() !== '' ? updatedSelection.name : selection.name;
                const queryUpdateSelection: string = `
                    UPDATE Selection
                    SET name = ?, selectionType = ?
                    WHERE id = ?`
                await conn.query(queryUpdateSelection, [name.trim(), updatedSelection.selectionType, updatedSelection.id]);
                await conn.query('DELETE FROM Selection_Media WHERE selectionId = ?', [updatedSelection.id]);
                const messageMediaSelection: string = await this.insertManyMediasIntoSelection(updatedSelection.mediaList, updatedSelection.id, conn);
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: `${this.i18nService.t("common.SELECTION.SELECTION_MODIFIED")} \n ${messageMediaSelection}`,
                    other: { id: updatedSelection.id }
                }
            } else {
                return {
                    id: -1,
                    state: false,
                    message: this.i18nService.t("common.SELECTION.SELECTION_UNFOUND")
                }
            }
        } catch (error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

    public async deleteSelectionById(selectionId: number): Promise<ReturnMessage> {
        let returnMessage !: ReturnMessage;
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM Selection_Page WHERE selectionId = ?', [selectionId]);
            await conn.query('DELETE FROM Selection_Media WHERE selectionId = ?', [selectionId]);
            await conn.query('DELETE FROM License_Selection WHERE selectionId = ?', [selectionId]);
            await conn.query('DELETE FROM Selection WHERE id = ?', [selectionId]);
            await conn.commit();
            returnMessage = {
                id: -1,
                state: true,
                message: this.i18nService.t("common.SELECTION.SELECTION_DELETED")
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

    private async insertManyMediasIntoSelection(medias: number[], selectionId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const values: any[] = [];
            if (medias.length > 0) {
                medias.forEach((media: number, index) => {
                    values.push(selectionId, media, index);
                });
                const query: string = `
                    INSERT INTO Selection_Media (selectionId, mediaId, orderIndex)
                    VALUES ${medias.map(() => '(?, ?, ?)').join(', ')}`;
                await conn.query(query, values);
                return this.i18nService.t("common.SELECTION.COUNT_MEDIA_ADDED_INTO_SELECTION", {
                    args: {
                        count: medias.length
                    }
                })
            } else {
                return this.i18nService.t("common.SELECTION.NO_MEDIA_ADDED_INTO_SELECTION");
            }
        } catch (error) {
            throw error;
        }
    }

    public async updateSelectionByPageType(selectionIds: number[], pageType: PageType): Promise<ReturnMessage> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const values: any[] = [];
            await conn.query(`DELETE FROM Selection_Page WHERE pageType = ?`, [pageType]);
            if (selectionIds.length > 0) {
                selectionIds.forEach((selectionId: number, index) => {
                    values.push(selectionId, pageType, index);
                });
                const query: string = `INSERT INTO Selection_Page
                    (selectionId, pageType, orderIndex)
                    VALUES ${selectionIds.map(() => '(?, ?, ?)').join(', ')}`;
                const result = await conn.query(query, values);
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: `${this.i18nService.t("common.SELECTION.SELECTION_ADDED_INTO_PAGE")} ${pageType} (${result.affectedRows})`
                }
            } else {
                await conn.commit();
                return {
                    id: 1,
                    state: true,
                    message: `${this.i18nService.t("common.SELECTION.NOT_SELECTION_ADDED_INTO_PAGE")} ${pageType}`
                }
            }
        } catch (error: any) {
            await conn.rollback();
            return {
                id: -1,
                state: false,
                message: `${this.i18nService.t("common.ERROR")}: ${error.sqlMessage}`
            }
        } finally {
            await conn.release();
        }
    }

}
