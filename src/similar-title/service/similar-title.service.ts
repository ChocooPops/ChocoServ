import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { JellyfinService } from "src/jellyfin/service/jellyfin.service";
import * as mariadb from 'mariadb';
import { DATABASE_POOL } from 'src/database/database.module';
import { Media } from "src/media/dto/media.interface";
import { SimilarTitle } from "../dto/similar-title.interface";
import { MediaType } from "src/media/dto/media-type.enum";
import { MovieService } from "src/movie/service/movie.service";
import { SeriesService } from "src/series/service/series.service";
import { MediaService } from "src/media/service/media.service";
import { Link } from "src/common-interface/link.interface";
import { Node } from "src/common-interface/node.interface";

@Injectable()
export class SimilarTitleService {

    private maxSimilarTitles: number = 20;

    constructor(@Inject(DATABASE_POOL) protected readonly pool: mariadb.Pool,
        private readonly mediaService: MediaService,
        @Inject(forwardRef(() => JellyfinService))
        private readonly jellyfinService: JellyfinService,
        @Inject(forwardRef(() => MovieService))
        private readonly movieService: MovieService,
        @Inject(forwardRef(() => SeriesService))
        private readonly seriesService: SeriesService) { }

    public async getLinksSimilarTitle(): Promise<Link[]> {
        const conn = await this.pool.getConnection();
        try {
            const links: Link[] = await conn.query(`SELECT sourceId as source, targetId as target FROM Similar_Title`);
            return links;
        } catch (error) {
            return null;
        } finally {
            await conn.release();
        }
    }

    private getQuerySelectSimilarMedia(WHERE: string): string {
        return `
        SELECT 
            ${this.mediaService.getQuerySelectManyMedia('ORDER BY st.rate DESC')} AS media
        FROM Similar_Title st
        LEFT JOIN media m ON m.id = st.targetId
        ${this.mediaService.getQueryJoinMedia()}
        ${WHERE}
        GROUP BY st.sourceId`;
    }

    public async getAllMediaWhichHasLessThanMaxSimilarTitles(): Promise<{ movies: Node[], series: Node[] }> {
        const conn = await this.pool.getConnection();
        const nodeMovies: Node[] = [];
        const nodeSeries: Node[] = [];
        try {
            const query: string = `
            SELECT m.id, m.title, m.mediaType, COUNT(st.id) AS total
                FROM media m
                LEFT JOIN similar_title st ON st.sourceId = m.id
                GROUP BY st.sourceId
                HAVING total < ?`;
            const medias: Media[] = await conn.query(query, [this.maxSimilarTitles]);
            medias.forEach((media: Media) => {
                if (media.mediaType === MediaType.MOVIE) {
                    nodeMovies.push({
                        id: media.id,
                        name: media.title
                    });
                } else if (media.mediaType === MediaType.SERIES) {
                    nodeSeries.push({
                        id: media.id,
                        name: media.title
                    });
                }
            });
            return {
                movies: nodeMovies,
                series: nodeSeries
            }
        } catch (error) {
            return {
                movies: nodeMovies,
                series: nodeSeries
            }
        } finally {
            await conn.release();
        }
    }

    public async getLinksBetweenSimilarTitle(): Promise<any[]> {
        return [];
    }

    public async getAllSimilarTitlesForOneMediaByIdAndType(sourceId: number): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectSimilarMedia(`WHERE st.sourceId = ?`);
            const results: any = await conn.query(query, [sourceId]);
            const medias: Media[] = results[0].media
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

    public async rewriteAllSimilarTitle(): Promise<SimilarTitle[]> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`DELETE FROM Similar_Title;`);
            const medias: Media[] = await conn.query(`SELECT id FROM MEDIA;`);
            for (const media of medias) {
                await this.saveSimilarTitlesForMediaByIdWithJellyfinDataBase(media.id, conn);
            }
            const results: SimilarTitle[] = await conn.query(`Select id, sourceId, targetId, rate FROM Similar_Title`);
            results.forEach((result: SimilarTitle, index) => {
                results[index].id = Number(result.id);
                results[index].sourceId = Number(result.sourceId);
                results[index].targetId = Number(result.targetId);
                results[index].rate = Number(result.rate);
            });
            await conn.commit();
            return results;
        } catch (error) {
            await conn.rollback();
            return error;
        } finally {
            await conn.release();
        }
    }

    public async saveSimilarTitlesForMediaByIdWithJellyfinDataBase(mediaId: number, conn: mariadb.PoolConnection): Promise<string> {
        try {
            const currentMovie = await conn.query(`Select jellyfinId FROM Media WHERE id = ?`, [mediaId]);
            if (currentMovie.length > 0) {
                const medias: Media[] = await conn.query(`Select id, jellyfinId, mediaType FROM Media`);
                const similarTitles: any[] = (await this.jellyfinService.getSimilarTitleByJellyfinId(currentMovie[0].jellyfinId));
                const values: any[] = [];
                const iteration: number[] = [];
                for (const title of similarTitles) {
                    if (iteration.length >= this.maxSimilarTitles) {
                        break;
                    }
                    const targetMedia: Media = medias.find((media: Media) => media.jellyfinId === title.Id);
                    if (targetMedia) {
                        const rate: number = (this.maxSimilarTitles - iteration.length) / this.maxSimilarTitles;
                        values.push(mediaId, targetMedia.id, rate);
                        iteration.push(1);
                    }
                }
                if (iteration.length > 0) {
                    const query: string = `
                    INSERT INTO Similar_Title (sourceId, targetId, rate)
                    VALUES ${iteration.map(() => '(?, ?, ?)').join(', ')}`
                    const result = await conn.query(query, values);
                    return `Titre similaire ajouté (${result.affectedRows})`;
                } else {
                    return `Aucun titre similaire n'a été ajouté`
                }
            } else {
                return 'Aucun titre similaire a été ajouté';
            }
        } catch (error) {
            throw error;
        }
    }
}
