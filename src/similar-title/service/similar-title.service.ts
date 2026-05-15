import { Injectable, Inject, forwardRef } from "@nestjs/common";
import * as mariadb from 'mariadb';
import { DATABASE_POOL } from 'src/database/database.module';
import { Media } from "src/media/dto/media.interface";
import { SimilarTitle } from "../dto/similar-title.interface";
import { MediaType } from "src/media/dto/media-type.enum";
import { MovieService } from "src/movie/service/movie.service";
import { SeriesService } from "src/series/service/series.service";
import { Link } from "src/common-interface/link.interface";
import { Node } from "src/common-interface/node.interface";
import { Job } from "src/credit/dto/job.enum";
import { MediaService } from "src/media/service/media/media.service";
import { CreditService } from "src/credit/service/credit.service";

interface MediaRow {
  id: number;
  title: string;
  description: string | null;
  date: string;
  mediaType: MediaType;
  productionYear: number;
  categoryIds: string | null;
  castIds: string | null;
  crewIds: string | null;
  keywords: string | null;
}

interface TranslationRow {
  mediaId: number;
  title: string;
  iso_639_1: string;
}

export interface SimilarMediaResult {
  id: number;
  title: string;
  similarityScore: number;
}

@Injectable()
export class SimilarTitleService {

    private maxSimilarTitles: number = 20;
    private readonly LIMIT_CREDIT: number = 15;

    constructor(@Inject(DATABASE_POOL) protected readonly pool: mariadb.Pool,
        private readonly creditService: CreditService,
        private readonly mediaService: MediaService,
        @Inject(forwardRef(() => MovieService))
        private readonly movieService: MovieService,
        @Inject(forwardRef(() => SeriesService))
        private readonly seriesService: SeriesService,) { }

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

       private async getMediaFormated(conn: mariadb.PoolConnection): Promise<{ medias: MediaRow[], translations: TranslationRow[] }>{
        try {
            const jobFilters: string = `${this.creditService
                .getJobToFilters()
                .map((item) => `'${item}'`)
                .join(', ')}`;

            const medias: MediaRow[] = await conn.query(`
                SELECT
                    m.id,
                    m.title,
                    m.description,
                    m.date,
                    m.mediaType,
                    YEAR(m.date) AS productionYear,
                    GROUP_CONCAT(DISTINCT mc.categoryId ORDER BY mc.categoryId SEPARATOR ',') AS categoryIds,
                    GROUP_CONCAT(DISTINCT actors.creditId SEPARATOR ',')    AS castIds,
                    GROUP_CONCAT(DISTINCT crew.creditId SEPARATOR ',')      AS crewIds,
                    GROUP_CONCAT(DISTINCT k.name ORDER BY k.name SEPARATOR ',') AS keywords
                FROM Media m
                LEFT JOIN Media_Category mc ON mc.mediaId = m.id
                LEFT JOIN (
                    SELECT creditId, mediaId
                    FROM (
                        SELECT creditId, mediaId,
                            ROW_NUMBER() OVER (PARTITION BY mediaId ORDER BY creditId) AS rn
                        FROM Media_Credit
                        WHERE job = '${Job.ACTOR}'
                    ) ranked_actors
                    WHERE rn <= ${this.LIMIT_CREDIT}
                ) actors ON actors.mediaId = m.id
                LEFT JOIN (
                    SELECT creditId, mediaId
                    FROM (
                        SELECT creditId, mediaId,
                            ROW_NUMBER() OVER (PARTITION BY mediaId ORDER BY creditId) AS rn
                        FROM Media_Credit
                        WHERE job IN (${jobFilters}) AND job != '${Job.ACTOR}'
                    ) ranked_crew
                    WHERE rn <= ${this.LIMIT_CREDIT}
                ) crew ON crew.mediaId = m.id
                LEFT JOIN Keyword k ON k.mediaId = m.id
                GROUP BY m.id
            `);

            const translations: TranslationRow[] = await conn.query(`
                SELECT mediaId, title, iso_639_1
                FROM Translation_Title
                WHERE iso_639_1 IN ('VO', 'US', 'FR')
            `);

            return {
                medias: medias,
                translations: translations
            }
        } catch(error) {
            throw error;
        }
    }

    public async getAllSimilarTitlesForOneMediaByIdAndType(userId: number, sourceId: number): Promise<Media[]> {
        const conn = await this.pool.getConnection();
        try {
            const query: string = this.getQuerySelectSimilarMedia(`WHERE st.sourceId = ?`);
            const results: any = await conn.query(query, [userId, userId, sourceId]);
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

    public async rewriteAllSimilarTitle(): Promise<SimilarTitle[]> {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`DELETE FROM Similar_Title;`);
            const rows = await this.getMediaFormated(conn);
            const medias: Media[] = await conn.query(`SELECT id FROM MEDIA;`);
            for (const media of medias) {
                await this.saveSimilarTitlesForMediaById(media.id, conn, rows.medias, rows.translations);
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
            throw error;
        } finally {
            await conn.release();
        }
    }

    public async saveSimilarTitlesForMediaById(mediaId: number, conn: mariadb.PoolConnection, medias?: MediaRow[], translations?: TranslationRow[]): Promise<any> {
        try {
            if (!medias || !translations) {
                const rows = await this.getMediaFormated(conn);
                medias = rows.medias;
                translations = rows.translations;
            }
            const similarMedias = this.getSimilarMedia(mediaId, medias, translations);
            
            if (similarMedias.length > 0) {
                const values: any[] = [];
                const iteration: number[] = [];
                similarMedias.forEach((title) => {
                    const rate: number = (this.maxSimilarTitles - iteration.length) / this.maxSimilarTitles;
                    values.push(mediaId, title.id, rate);
                    iteration.push(title.id);
                });
                const query: string = `
                    INSERT INTO Similar_Title (sourceId, targetId, rate)
                    VALUES ${iteration.map(() => '(?, ?, ?)').join(', ')}`
                    const result = await conn.query(query, values);
                    return `Titre similaire ajouté (${result.affectedRows})`;
            } else {
                return `Aucun titre similaire n'a été ajouté`
            }
        } catch (error) {
            throw error;
        }
    }

    private readonly LATIN_REGEX =
    /^[\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF\s\d.,!?'":()\-&]+$/;

    private jaroWinkler(s1: string, s2: string): number {
        if (s1 === s2) return 1;
        if (s1.length === 0 || s2.length === 0) return 0;

        const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
        const s1Matches     = new Array(s1.length).fill(false);
        const s2Matches     = new Array(s2.length).fill(false);

        let matches        = 0;
        let transpositions = 0;

        for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - matchDistance);
        const end   = Math.min(i + matchDistance + 1, s2.length);
        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
        }

        if (matches === 0) return 0;

        let k = 0;
        for (let i = 0; i < s1.length; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
        }

        const jaro =
        (matches / s1.length +
            matches / s2.length +
            (matches - transpositions / 2) / matches) /
        3;

        let prefix = 0;
        for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
        }

        return jaro + prefix * 0.1 * (1 - jaro);
    }

    private normalizeTitle(title: string): string {
        const DETERMINANTS = /^(the|a|an|le|la|les|l'|un|une|des|el|la|los|las|der|die|das|il|i|gli|le|o|a|os|as)\s+/gi;

        return title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')  // accents
            .replace(/[^a-z0-9 ]/g, ' ')     // ponctuation → espace
            .replace(/\b\d+\b/g, '')         // ← supprime les nombres isolés
            .replace(DETERMINANTS, '')        // ← supprime les déterminants en début
            .replace(/\s+/g, ' ')
            .trim();
    }

    private toSet(val: string | null): Set<string> {
        return new Set(
            (val ?? '').split(',').filter(Boolean).map((s) => s.toLowerCase())
        );
    }

    private selectBestTitle(
        mediaTitle: string,
        translations: { title: string; iso_639_1: string }[],
    ): string {
        const get = (lang: string) =>
        translations.find((t) => t.iso_639_1 === lang)?.title ?? null;

        const vo = get('VO');
        if (vo && this.LATIN_REGEX.test(vo)) return vo;

        const us = get('US');
        if (us) return us;

        const fr = get('FR');
        if (fr) return fr;

        return mediaTitle;
    }

    private computeScore(source: MediaRow, candidate: MediaRow): {
        score: number;
        commonCategoryIds: string[];
        commonActorIds: string[];
        commonDirectorIds: string[];
        commonKeywords: string[];
    } {
        const commonCategoryIds = [...this.toSet(source.categoryIds)].filter((x) =>
            this.toSet(candidate.categoryIds).has(x),
        );
        const commonActorIds = [...this.toSet(source.castIds)].filter((x) =>
            this.toSet(candidate.castIds).has(x),
        );
        const commonDirectorIds = [...this.toSet(source.crewIds)].filter((x) =>
            this.toSet(candidate.crewIds).has(x),
        );
        const commonKeywords = [...this.toSet(source.keywords)].filter((x) =>
            this.toSet(candidate.keywords).has(x),
        );

        let score = 0;

        // Métadonnées
        score += commonCategoryIds.length * 3; // catégories  — poids fort
        score += commonActorIds.length    * 3; // acteurs     — poids fort
        score += commonDirectorIds.length * 2; // réalisateur — poids moyen
        score += commonKeywords.length    * 2; // keywords    — poids moyen

        console.log(commonDirectorIds.length);
        console.log(commonActorIds.length);
        console.log("-------------------------");

        // Proximité année
        if (source.productionYear && candidate.productionYear) {
        const diff = Math.abs(source.productionYear - candidate.productionYear);
        if (diff <= 1)      score += 2;
        else if (diff <= 3) score += 1;
        }

        // Même type MOVIE / SERIES
        if (source.mediaType === candidate.mediaType) score += 1;

        // Similarité de titre — Jaro-Winkler
        const titleSimilarity = this.jaroWinkler(
            this.normalizeTitle(source.title),
            this.normalizeTitle(candidate.title),
        );
        if (titleSimilarity >= 0.85) {
            score += Math.round(titleSimilarity * 4); // max +4 points
        }

        return { score, commonCategoryIds, commonActorIds, commonDirectorIds, commonKeywords };
    }

    private getSimilarMedia(mediaId: number, medias: MediaRow[], translations: TranslationRow[]): SimilarMediaResult[] {
        try {
            const translationMap = new Map<number,
                { title: string; iso_639_1: string }[]>();

            for (const t of translations) {
                if (!translationMap.has(t.mediaId)) translationMap.set(t.mediaId, []);
                translationMap.get(t.mediaId)!.push({
                title:     t.title,
                iso_639_1: t.iso_639_1,
                });
            }

            const source = medias.find((r) => r.id === mediaId);
            if (!source) return [];

            return medias
                .filter((r) => r.id !== mediaId)
                .map((candidate) => {
                const {
                    score
                } = this.computeScore(source, candidate);

                const bestTitle = this.selectBestTitle(
                    candidate.title,
                    translationMap.get(candidate.id) ?? [],
                );
                
                return {
                    id:              candidate.id,
                    title:           bestTitle,
                    similarityScore: score,
                };
                })
                .filter((r) => r.similarityScore > 0)
                .sort((a, b) => b.similarityScore - a.similarityScore)
                .slice(0, this.maxSimilarTitles);
        } catch(error) {
            throw error;
        }
    }
}
