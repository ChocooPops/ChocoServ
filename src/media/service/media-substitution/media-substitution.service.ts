import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { SortCatalog } from 'src/media/dto/catalog/sort-catalog.enum';
import { FILTERS } from 'src/media/dto/catalog/filters.interface';
import { CreditService } from 'src/credit/service/credit.service';
import { FilterType } from 'src/media/dto/catalog/filter-type.enum';
import { Operation } from 'src/media/dto/catalog/operation.enum';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Job } from 'src/credit/dto/job.enum';
import { MediaInfo } from 'src/media/dto/media-info.interface';
import { Media } from 'src/media/dto/media.interface';
import { MediaCredit } from 'src/credit/dto/media-credit.interface';
import { FormatPathService } from '../../../common-service/format-path.service';
import { MediaService } from '../media/media.service';

@Injectable()
export class MediaSubstitutionSerivce {

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: mariadb.Pool,
    private readonly creditService: CreditService,
    private readonly mediaService: MediaService,
    private readonly formatPathService: FormatPathService
  ) {}

  private readonly LIMIT_CREDIT: number = 12;

  public async getMediaByCatalogFilters(
    userId: number,
    sortFilter: SortCatalog,
    orderDirection: boolean,
    count: number,
    offset: number,
    filters: FILTERS[],
  ): Promise<any[]> {
    const conn = await this.pool.getConnection();
    const jobFilters: string = `${this.creditService
      .getJobToFilters()
      .map((item) => `'${item}'`)
      .join(', ')}`;

    try {
      const joinParams: any[] = [];
      const whereParams: any[] = [userId, userId];
      const orBlocks: string[] = [];
      let JOIN: string = '';

      for (const filter of filters ?? []) {
        const values = filter.value ?? [];
        const andConditions: string[] = [];

        for (const val of values) {
          const isNumber = typeof val.value === 'number';
          switch (filter.typeData) {
            case FilterType.MEDIA: {
              if (val.value != MediaType.ALL.toString()) {
                if (filter.operation === Operation.CONTAIN) {
                  andConditions.push(
                    isNumber ? `m.id = ?` : `m.mediaType LIKE ?`,
                  );
                  whereParams.push(isNumber ? val.value : `%${val.value}%`);
                } else if (filter.operation === Operation.NOT_CONTAIN) {
                  andConditions.push(
                    isNumber ? `m.id != ?` : `m.mediaType NOT LIKE ?`,
                  );
                  whereParams.push(isNumber ? val.value : `%${val.value}%`);
                }
              }
              break;
            }

            case FilterType.YEAR: {
              if (filter.operation === Operation.CONTAIN) {
                andConditions.push(`(YEAR(m.date) = ?)`);
                whereParams.push(val.value);
              } else if (filter.operation === Operation.NOT_CONTAIN) {
                andConditions.push(`(YEAR(m.date) != ?)`);
                whereParams.push(val.value);
              }
              break;
            }

            case FilterType.DECADE: {
              if (isNumber) {
                const d = Number(val.value);
                if (filter.operation === Operation.CONTAIN) {
                  andConditions.push(
                    `(YEAR(m.date) >= ? AND YEAR(m.date) < ?)`,
                  );
                  whereParams.push(d, d + 10);
                } else if (filter.operation === Operation.NOT_CONTAIN) {
                  andConditions.push(`(YEAR(m.date) < ? OR YEAR(m.date) >= ?)`);
                  whereParams.push(d, d + 10);
                }
              }
              break;
            }

            case FilterType.CATEGORY: {
              if (filter.operation === Operation.CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `EXISTS (SELECT 1 FROM media_category mc WHERE mc.mediaId = m.id AND mc.categoryId = ?)`
                    : `EXISTS (SELECT 1 FROM media_category mc JOIN category c ON c.id = mc.categoryId WHERE mc.mediaId = m.id AND c.translationKey LIKE ?)`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              } else if (filter.operation === Operation.NOT_CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `NOT EXISTS (SELECT 1 FROM media_category mc WHERE mc.mediaId = m.id AND mc.categoryId = ?)`
                    : `NOT EXISTS (SELECT 1 FROM media_category mc JOIN category c ON c.id = mc.categoryId WHERE mc.mediaId = m.id AND c.translationKey LIKE ?)`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              }
              break;
            }

            case FilterType.KEY_WORD: {
              if (filter.operation === Operation.CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `EXISTS (SELECT 1 FROM keyword k WHERE k.mediaId = m.id AND k.id = ?)`
                    : `EXISTS (SELECT 1 FROM keyword k WHERE k.mediaId = m.id AND k.name LIKE ?)`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              } else if (filter.operation === Operation.NOT_CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `NOT EXISTS (SELECT 1 FROM keyword k WHERE k.mediaId = m.id AND k.id = ?)`
                    : `NOT EXISTS (SELECT 1 FROM keyword k WHERE k.mediaId = m.id AND k.name LIKE ?)`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              }
              break;
            }

            case FilterType.CREDIT: {
              if (filter.operation === Operation.CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `EXISTS (
                                            SELECT 1 FROM Media_Credit mc_any
                                            WHERE mc_any.mediaId = m.id
                                            AND mc_any.creditId = ?
                                            AND mc_any.job IN (${jobFilters}) )`
                    : `EXISTS (
                                            SELECT 1 FROM Media_Credit mc_any
                                            INNER JOIN Credit c_any ON c_any.id = mc_any.creditId
                                            WHERE mc_any.mediaId = m.id
                                            AND c_any.fullName LIKE ?
                                            AND mc_any.job IN (${jobFilters}))`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              } else if (filter.operation === Operation.NOT_CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `NOT EXISTS (
                                            SELECT 1 FROM Media_Credit mc_any
                                            WHERE mc_any.mediaId = m.id
                                            AND mc_any.creditId = ?)`
                    : `NOT EXISTS (
                                            SELECT 1 FROM Media_Credit mc_any
                                            INNER JOIN Credit c_any ON c_any.id = mc_any.creditId
                                            WHERE mc_any.mediaId = m.id
                                            AND c_any.fullName LIKE ?)`,
                );
                whereParams.push(isNumber ? val.value : `%${val.value}%`);
              }
              break;
            }

            default: {
              const job = filter.typeData as Job;

              if (filter.operation === Operation.CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `EXISTS (
                                            SELECT 1 FROM Media_Credit mc_sub
                                            WHERE mc_sub.mediaId = m.id
                                            AND mc_sub.job = ?
                                            AND mc_sub.creditId = ?)`
                    : `EXISTS (
                                            SELECT 1 FROM Media_Credit mc_sub
                                            INNER JOIN Credit c ON c.id = mc_sub.creditId
                                            WHERE mc_sub.mediaId = m.id
                                            AND mc_sub.job = ?
                                            AND c.fullName LIKE ?)`,
                );
                whereParams.push(job, isNumber ? val.value : `%${val.value}%`);
              } else if (filter.operation === Operation.NOT_CONTAIN) {
                andConditions.push(
                  isNumber
                    ? `NOT EXISTS (
                                            SELECT 1 FROM Media_Credit mc_sub
                                            WHERE mc_sub.mediaId = m.id
                                            AND mc_sub.job = ?
                                            AND mc_sub.creditId = ?)`
                    : `NOT EXISTS (
                                            SELECT 1 FROM Media_Credit mc_sub
                                            INNER JOIN Credit c ON c.id = mc_sub.creditId
                                            WHERE mc_sub.mediaId = m.id
                                            AND mc_sub.job = ?
                                            AND c.fullName LIKE ?)`,
                );
                whereParams.push(job, isNumber ? val.value : `%${val.value}%`);
              }
              break;
            }
          }
        }

        if (andConditions.length > 0) {
          orBlocks.push(`(${andConditions.join(' OR ')})`);
        }
      }

      const finalParams: any[] = [...joinParams, ...whereParams];
      const WHERE: string =
        orBlocks.length > 0 ? `WHERE ${orBlocks.join(' AND ')}` : '';
      const direction: string = orderDirection ? 'ASC' : 'DESC';
      const ORDER: string = `ORDER BY ${this.resolveSortColumn(sortFilter)} ${direction}`;
      const LIMIT: string = `LIMIT ? OFFSET ?`;
      finalParams.push(count, offset);

      const query: string = this.mediaService.getQuerySelectMedia(
        JOIN,
        WHERE,
        ORDER,
        LIMIT,
      );
      const results: any[] = await conn.query(query, finalParams);

      return results;
    } catch (error) {
      return [];
    } finally {
      await conn.release();
    }
  }

  private resolveSortColumn(sort: SortCatalog): string {
    switch (sort) {
      case SortCatalog.TITLE:
        return 'm.title';
      case SortCatalog.RELEASE_DATE:
        return 'm.date';
      case SortCatalog.ADDED_DATE:
        return 'm.createdAt';
      case SortCatalog.DURATION:
        return 'mlib.duration';
      case SortCatalog.SHUFFLE:
        return 'RAND()';
      default:
        return 'RAND()';
    }
  }

  public async getMediaInfoById(mediaId: number): Promise<MediaInfo> {
    const conn = await this.pool.getConnection();
    const jobFilters: string = `${this.creditService
      .getJobToFilters()
      .map((item) => `'${item}'`)
      .join(', ')}`;
    const medias: Media[] = await conn.query(
      `Select mediaType From Media WHERE id = ?`,
      [mediaId],
    );
    const mediaType: MediaType | null =
      medias?.length > 0 ? medias[0].mediaType : null;
    let ORDER: string = '';
    if (mediaType === MediaType.MOVIE) {
      ORDER = this.creditService.getQueryOrderCreditForMovie('mc');
    } else if (mediaType === MediaType.SERIES) {
      ORDER = this.creditService.getQueryOrderCreditForSeries('mc');
    }
    const query: string = `SELECT
                JSON_OBJECT(
                    'id', m.id,
                    
                    'casts', cast.casts,
                    'crews', crew.crews,
                    'categories', cat.categories,
                    'keyWords', kw.keywords

                ) AS media
                FROM media m

                LEFT JOIN (
                    SELECT mediaId, JSON_ARRAYAGG(name) AS keywords
                    FROM keyword
                    GROUP BY mediaId
                ) kw ON kw.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', c.id,
                                'translationKey', c.translationKey
                            )
                        ) AS categories
                    FROM media_category mc
                    JOIN category c ON c.id = mc.categoryId
                    GROUP BY mc.mediaId
                ) cat ON cat.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', cca.id,
                                'tmdbId', cca.tmdbId,
                                'fullName', cca.fullName,
                                'originalFullName', cca.originalFullName,
                                'character', mc.character,
                                'job', mc.job,
                                'episodeCount', mc.episodeCount,
                                'srcPoster', p.name,
                                'order', mc.\`order\`
                            )
                            ORDER BY
                                mc.episodeCount desc,
                                mc.\`order\` asc
                            LIMIT 40
                        ) AS casts
                    FROM media_credit mc
                    JOIN credit cca ON cca.id = mc.creditId
                    LEFT JOIN Poster p ON p.id = cca.srcPoster
                    WHERE mc.job IN ('${Job.ACTOR}')
                    GROUP BY mc.mediaId
                    ORDER BY mc.\`order\` asc
                ) cast ON cast.mediaId = m.id

                LEFT JOIN (
                    SELECT mc.mediaId,
                        JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', ccr.id,
                                'tmdbId', ccr.tmdbId,
                                'fullName', ccr.fullName,
                                'originalFullName', ccr.originalFullName,
                                'character', mc.character,
                                'job', mc.job,
                                'episodeCount', mc.episodeCount,
                                'srcPoster', p.name,
                                'order', mc.\`order\`
                            )
                            ${ORDER}
                            LIMIT 40
                        ) AS crews
                    FROM media_credit mc
                    JOIN credit ccr ON ccr.id = mc.creditId
                    LEFT JOIN Poster p ON p.id = ccr.srcPoster
                    WHERE mc.job IN (${jobFilters}) AND mc.job NOT LIKE '${Job.ACTOR}'
                    GROUP BY mc.mediaId
                    ORDER BY mc.\`order\` asc
                ) crew ON crew.mediaId = m.id
                
                WHERE m.id = ?`;

    try {
      const result: any[] = await conn.query(query, [mediaId]);
      const infos: MediaInfo = result[0].media;
      infos.casts?.forEach((cast: MediaCredit) => {
        cast.srcPoster =
          this.formatPathService.getOneFormatedPosterUrl(
            cast.id,
            MediaType.CREDIT,
            cast.srcPoster,
          );
      });
      infos.crews?.forEach((crew: MediaCredit) => {
        crew.srcPoster =
          this.formatPathService.getOneFormatedPosterUrl(
            crew.id,
            MediaType.CREDIT,
            crew.srcPoster,
          );
      });
      if (infos.casts) {
        const castsMap = new Map<number, MediaCredit>();
        for (const cast of infos.casts) {
          if (castsMap.has(cast.id)) {
            const existing = castsMap.get(cast.id)!;
            if (cast.character) {
              existing.character = existing.character
                ? `${existing.character} \\ ${cast.character}`
                : cast.character;
            }
          } else {
            castsMap.set(cast.id, { ...cast });
          }
          if (castsMap.size >= this.LIMIT_CREDIT) {
            break;
          }
        }
        infos.casts = Array.from(castsMap.values());
      }
      if (infos.crews) {
        const crewsMap = new Map<number, MediaCredit>();
        for (const crew of infos.crews) {
          if (crewsMap.has(crew.id)) {
            const existing = crewsMap.get(crew.id)!;
            if (crew.job) {
              existing.job = existing.job
                ? (`${existing.job} \\ ${crew.job}` as Job)
                : crew.job;
            }
          } else {
            crewsMap.set(crew.id, { ...crew });
          }
          if (crewsMap.size >= this.LIMIT_CREDIT) {
            break;
          }
        }
        infos.crews = Array.from(crewsMap.values());
      }
      return infos;
    } catch (error) {
      return null;
    } finally {
      await conn.release();
    }
  }
  
}
