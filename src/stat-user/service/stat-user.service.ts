import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Media } from 'src/media/dto/media.interface';
import { DATABASE_POOL } from 'src/database/database.module';
import * as mariadb from 'mariadb';
import { StatState } from '../dto/stat-state.enum';
import { StatUser } from '../dto/stat-user.enum';
import { MovieService } from 'src/movie/service/movie.service';
import { SeriesService } from 'src/series/service/series.service';
import { MediaType } from 'src/media/dto/media-type.enum';
import { Selection } from 'src/selection/dto/selection.interface';
import { SelectionType } from 'src/selection/dto/selection-type.enum';
import { CategoryStats } from '../dto/category-stats.interface';
import { UserCategoryPreferences } from '../dto/user-category-preferences.interface';
import { WatchTimeStats } from '../dto/watch-time-stats.interface';
import { ContentType } from '../dto/content.type';
import { DataPoint } from '../dto/data-point.interface';
import { PeriodType } from '../dto/period.type';
import { WatchingStatsResponse } from '../dto/watching-stats-response.interface';
import { TopMedia } from '../dto/top-media.interface';
import { TopMediaResponse } from '../dto/top-media-response.interface';
import { FormatPathService } from 'src/common-service/format-path.service';
import { MediaTypeFilter } from '../dto/media-type-filter.interface';
import { MediaService } from 'src/media/service/media/media.service';

@Injectable()
export class StatUserService {
  private readonly minimumRate: number = 92;

  constructor(
    @Inject(DATABASE_POOL) private pool: mariadb.Pool,
    @Inject(forwardRef(() => MediaService))
    private readonly mediaService: MediaService,
    @Inject(forwardRef(() => MovieService))
    private readonly movieService: MovieService,
    @Inject(forwardRef(() => SeriesService))
    private readonly seriesService: SeriesService,
    private readonly formatPathService: FormatPathService,
  ) {}

  public getQuerySelectMediaInProgress(): string {
    return `
                SELECT 
                ${this.mediaService.getQuerySelectManyMedia(`ORDER BY su.lastUpdated desc LIMIT 30`)} AS media
                FROM (
                    SELECT
                        su.userId,
                        COALESCE(s.id, su.movieId) AS mediaId,
                        MAX(su.updatedAt) AS lastUpdated
                    FROM Stat_User su
                    LEFT JOIN Episode e ON e.id = su.episodeId
                    LEFT JOIN Media s ON s.id = e.seriesId
                    WHERE su.userId = ?
                    GROUP BY su.userId, mediaId
                ) su
                JOIN media m ON m.id = su.mediaId
                ${this.mediaService.getQueryJoinMedia()}
                GROUP BY su.userId`;
  }

  public getQueryJoinStatUserForMedia(): string {
    return `
    LEFT JOIN (
      SELECT 
        su.movieId,
        su.watchProgress,
        su.state,
        su.updatedAt
        FROM Stat_User su
        INNER JOIN (
          SELECT 
            movieId,
            userId,
            MAX(updatedAt) AS max_updated
            FROM Stat_User
              WHERE userId = ? AND movieId IS NOT NULL
              GROUP BY movieId, userId
        ) latest ON su.movieId = latest.movieId 
        AND su.userId = latest.userId 
        AND su.updatedAt = latest.max_updated
        WHERE su.userId = ?
    ) su2 ON su2.movieId = m.id`
  }

  public getQueryJoinStatUserForEpisode(): string {
    return `
    LEFT JOIN (
      SELECT 
        su_inner.episodeId,
        su_inner.userId,
        su_inner.watchProgress,
        su_inner.state,
        su_inner.updatedAt
      FROM Stat_User su_inner
        INNER JOIN (
          SELECT 
          episodeId,
          userId,
          MAX(updatedAt) AS max_updated
          FROM Stat_User
            WHERE userId = ? AND episodeId IS NOT NULL
            GROUP BY episodeId, userId
          ) latest ON su_inner.episodeId = latest.episodeId 
          AND su_inner.userId = latest.userId 
          AND su_inner.updatedAt = latest.max_updated
          WHERE su_inner.userId = ?
      ) su ON su.episodeId = e.id AND su.userId = ?`
  }
  
  public async getMediaSelectionInProgess(
    userId: number,
    conn: mariadb.Connection,
  ): Promise<Selection | null> {
    try {
      const query: string = this.getQuerySelectMediaInProgress();
      const results: any[] = await conn.query(query, [userId, userId, userId]);
      if (results.length > 0) {
        const medias: Media[] = results[0].media;
        medias.forEach((media: Media, index) => {
          if (media.mediaType === MediaType.MOVIE) {
            medias[index] = this.movieService.getFormatedMovie(media);
          } else if (media.mediaType === MediaType.SERIES) {
            medias[index] = this.seriesService.getFormatedSeries(media);
          }
        });
        return {
          id: userId,
          name: 'Vue récemment',
          selectionType: SelectionType.NORMAL_POSTER,
          mediaList: medias,
        };
      } else {
        return null;
      }
    } catch (error) {
      throw error;
    }
  }

  public async saveStatUserForMovie(
    userId: number,
    movieId: number,
    watchProgress: number,
  ): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const newState =
        watchProgress >= this.minimumRate
          ? StatState.FINISHED
          : StatState.IN_PROGRESS;

      const statInProgress: StatUser[] = await conn.query(
        `SELECT * FROM Stat_User 
        WHERE userId = ? AND movieId = ? AND state = ?
        FOR UPDATE`,
        [userId, movieId, StatState.IN_PROGRESS],
      );

      if (statInProgress.length > 0) {
        const queryUpdate: string = `
                        UPDATE Stat_User
                        SET watchProgress = ?, state = ?
                        WHERE id = ?`;
        await conn.query(queryUpdate, [
          watchProgress,
          newState,
          statInProgress[0].id,
        ]);
      } else {
        const statFinishedToday: StatUser[] = await conn.query(
          `SELECT * FROM Stat_User 
                        WHERE userId = ? 
                        AND movieId = ? 
                        AND state = ? 
                        AND DATE(updatedAt) = CURDATE()
                        FOR UPDATE`,
          [userId, movieId, StatState.FINISHED],
        );

        if (statFinishedToday.length === 0) {
          const queryInsert: string = `
                            INSERT INTO Stat_User (userId, movieId, state, watchProgress) 
                            VALUES (?, ?, ?, ?)`;

          await conn.query(queryInsert, [
            userId,
            movieId,
            newState,
            watchProgress,
          ]);
        } else {
          const queryUpdateFinished: string = `
                            UPDATE Stat_User
                            SET watchProgress = ?, state = ?
                            WHERE id = ?`;
          await conn.query(queryUpdateFinished, [
            watchProgress,
            newState,
            statFinishedToday[0].id,
          ]);
        }
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
    } finally {
      await conn.release();
    }
  }

  public async saveStatUserForEpisode(
    userId: number,
    episodeId: number,
    watchProgress: number,
  ): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const newState =
        watchProgress >= this.minimumRate
          ? StatState.FINISHED
          : StatState.IN_PROGRESS;

      const statInProgress: StatUser[] = await conn.query(
        `SELECT * FROM Stat_User 
        WHERE userId = ? AND episodeId = ? AND state = ?
        FOR UPDATE`,
        [userId, episodeId, StatState.IN_PROGRESS],
      );

      if (statInProgress.length > 0) {
        const queryUpdate: string = `
                        UPDATE Stat_User
                        SET watchProgress = ?, state = ?
                        WHERE id = ?`;
        await conn.query(queryUpdate, [
          watchProgress,
          newState,
          statInProgress[0].id,
        ]);
      } else {
        const statFinishedToday: StatUser[] = await conn.query(
          `SELECT * FROM Stat_User 
                        WHERE userId = ? 
                        AND episodeId = ? 
                        AND state = ? 
                        AND DATE(updatedAt) = CURDATE()
                        FOR UPDATE`,
          [userId, episodeId, StatState.FINISHED],
        );

        if (statFinishedToday.length === 0) {
          const queryInsert: string = `
                            INSERT INTO Stat_User (userId, episodeId, state, watchProgress) 
                            VALUES (?, ?, ?, ?)`;

          await conn.query(queryInsert, [
            userId,
            episodeId,
            newState,
            watchProgress,
          ]);
        } else {
          const queryUpdateFinished: string = `
                            UPDATE Stat_User
                            SET watchProgress = ?, state = ?
                            WHERE id = ?`;
          await conn.query(queryUpdateFinished, [
            watchProgress,
            newState,
            statFinishedToday[0].id,
          ]);
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
    } finally {
      await conn.release();
    }
  }

  /**
   * Récupère les catégories préférées d'un utilisateur avec leurs ratios
   * @param userId - ID de l'utilisateur
   * @param limit - Nombre de catégories à retourner (par défaut: 10)
   * @returns Les catégories avec leurs statistiques
   */
  async getUserPreferredCategories(
    userId: number,
    limit: number = 10,
  ): Promise<UserCategoryPreferences> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
        WITH user_content AS (
            -- Récupérer tous les films regardés par l'utilisateur
            SELECT DISTINCT
            m.id as mediaId,
            'MOVIE' as contentType
            FROM Stat_User su
            INNER JOIN Media m ON m.id = su.movieId
            WHERE su.userId = ?
            AND su.movieId IS NOT NULL
            
            UNION ALL
            
            -- Récupérer toutes les séries regardées via les épisodes
            SELECT DISTINCT
            e.seriesId as mediaId,
            'SERIES' as contentType
            FROM Stat_User su
            INNER JOIN Episode e ON e.id = su.episodeId
            WHERE su.userId = ?
            AND su.episodeId IS NOT NULL
        ),
        category_counts AS (
            -- Compter les occurrences de chaque catégorie
            SELECT 
            c.id as categoryId,
            c.translationKey as categoryName,
            COUNT(DISTINCT uc.mediaId) as count
            FROM user_content uc
            INNER JOIN Media_Category mc ON mc.mediaId = uc.mediaId
            INNER JOIN Category c ON c.id = mc.categoryId
            GROUP BY c.id, c.translationKey
        ),
        total_count AS (
            -- Total = somme des counts par catégorie (base commune pour que sum(%) = 100)
            SELECT SUM(count) as total
            FROM category_counts
        )
        SELECT 
            cc.categoryId,
            cc.categoryName,
            cc.count,
            ROUND((cc.count * 100.0 / tc.total), 2) as percentage,
            tc.total as totalWatched
        FROM category_counts cc
        CROSS JOIN total_count tc
        ORDER BY cc.count DESC
        LIMIT ?
        `;

      const rows = await conn.query(query, [userId, userId, limit]);

      if (!rows || (rows as any[]).length === 0) {
        return {
          userId,
          totalWatched: 0,
          categories: [],
        };
      }

      const data = rows as any[];
      const totalWatched = data[0]?.totalWatched || 0;

      const categories: CategoryStats[] = data.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count: row.count,
        percentage: parseFloat(row.percentage),
      }));

      return {
        userId,
        totalWatched,
        categories,
      };
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  async getUserPreferredCategoriesWeighted(
    userId: number,
    limit: number = 10,
  ): Promise<UserCategoryPreferences> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
            WITH user_content_weighted AS (
                -- Films avec leur progression de visionnage
                SELECT 
                m.id as mediaId,
                'MOVIE' as contentType,
                MAX(su.watchProgress) as weight
                FROM Stat_User su
                INNER JOIN Media m ON m.id = su.movieId
                WHERE su.userId = ?
                AND su.movieId IS NOT NULL
                GROUP BY m.id
                
                UNION ALL
                
                -- Séries avec progression moyenne des épisodes regardés
                SELECT 
                e.seriesId as mediaId,
                'SERIES' as contentType,
                AVG(su.watchProgress) as weight
                FROM Stat_User su
                INNER JOIN Episode e ON e.id = su.episodeId
                WHERE su.userId = ?
                AND su.episodeId IS NOT NULL
                GROUP BY e.seriesId
            ),
            category_weighted_counts AS (
                -- Compter avec pondération
                SELECT 
                c.id as categoryId,
                c.translationKey as categoryName,
                SUM(ucw.weight / 100.0) as weighted_count,
                COUNT(DISTINCT ucw.mediaId) as count
                FROM user_content_weighted ucw
                INNER JOIN Media_Category mc ON mc.mediaId = ucw.mediaId
                INNER JOIN Category c ON c.id = mc.categoryId
                GROUP BY c.id, c.translationKey
            ),
            total_weighted AS (
                -- Total = somme des weighted_count par catégorie (base commune pour que sum(%) = 100)
                SELECT SUM(weighted_count) as total
                FROM category_weighted_counts
            )
            SELECT 
                cwc.categoryId,
                cwc.categoryName,
                cwc.count,
                ROUND(cwc.weighted_count, 2) as weighted_count,
                ROUND((cwc.weighted_count * 100.0 / tw.total), 2) as percentage,
                ROUND(tw.total, 2) as totalWatched
            FROM category_weighted_counts cwc
            CROSS JOIN total_weighted tw
            ORDER BY cwc.weighted_count DESC
            LIMIT ?
            `;

      const rows = await conn.query(query, [userId, userId, limit]);

      if (!rows || (rows as any[]).length === 0) {
        return {
          userId,
          totalWatched: 0,
          categories: [],
        };
      }

      const data = rows as any[];
      const totalWatched = parseFloat(data[0]?.totalWatched || 0);

      const categories: CategoryStats[] = data.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count: row.count,
        percentage: parseFloat(row.percentage),
      }));

      return {
        userId,
        totalWatched,
        categories,
      };
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  /**
   * Récupère les catégories avec un temps de visionnage total
   * (Prend en compte le temps réel passé à regarder chaque contenu)
   * @param userId - ID de l'utilisateur
   * @param limit - Nombre de catégories à retourner
   */
  async getUserPreferredCategoriesByTime(
    userId: number,
    limit: number = 10,
  ): Promise<any> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
                WITH user_content_time AS (
                    -- Temps total passé sur les films
                    SELECT 
                    m.id as mediaId,
                    'MOVIE' as contentType,
                    (mlib.duration * MAX(su.watchProgress) / 100.0) as time_watched
                    FROM Stat_User su
                    INNER JOIN Media m ON m.id = su.movieId
                    INNER JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
                    WHERE su.userId = ?
                    AND su.movieId IS NOT NULL
                    AND mlib.duration IS NOT NULL
                    GROUP BY m.id, mlib.duration
                    
                    UNION ALL
                    
                    -- Temps total passé sur les épisodes
                    SELECT 
                    e.seriesId as mediaId,
                    'SERIES' as contentType,
                    SUM(mlib.duration * su.watchProgress / 100.0) as time_watched
                    FROM Stat_User su
                    INNER JOIN Episode e ON e.id = su.episodeId
                    INNER JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
                    WHERE su.userId = ?
                    AND su.episodeId IS NOT NULL
                    AND mlib.duration IS NOT NULL
                    GROUP BY e.seriesId
                ),
                category_time_counts AS (
                    SELECT 
                    c.id as categoryId,
                    c.translationKey as categoryName,
                    COUNT(DISTINCT uct.mediaId) as count,
                    SUM(uct.time_watched) as total_time
                    FROM user_content_time uct
                    INNER JOIN Media_Category mc ON mc.mediaId = uct.mediaId
                    INNER JOIN Category c ON c.id = mc.categoryId
                    GROUP BY c.id, c.translationKey
                ),
                total_time AS (
                    -- Total = somme des total_time par catégorie (base commune pour que sum(%) = 100)
                    SELECT SUM(total_time) as total
                    FROM category_time_counts
                )
                SELECT 
                    ctc.categoryId,
                    ctc.categoryName,
                    ctc.count,
                    ROUND(ctc.total_time / 1000, 2) as total_time_seconds,
                    ROUND(ctc.total_time / 60000, 2) as total_time_minutes,
                    ROUND(ctc.total_time / 3600000, 2) as total_time_hours,
                    ROUND((ctc.total_time * 100.0 / tt.total), 2) as percentage
                FROM category_time_counts ctc
                CROSS JOIN total_time tt
                ORDER BY ctc.total_time DESC
                LIMIT ?`;

      const rows = await conn.query(query, [userId, userId, limit]);
      return rows;
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  async getUserWatchTime(userId: number): Promise<WatchTimeStats> {
    const conn = await this.pool.getConnection();
    try {
      const query = `
      WITH movie_time AS (
        -- Calculer le temps passé sur les films
        -- time est en bigint, diviser par 10_00 pour obtenir les secondes
        SELECT 
          m.id as movie_id,
          (mlib.duration / 1000) as time_seconds,
          MAX(su.watchProgress) as max_progress
        FROM Stat_User su
        INNER JOIN Media m ON m.id = su.movieId
        INNER JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
        WHERE su.userId = ?
          AND su.movieId IS NOT NULL
          AND mlib.duration IS NOT NULL
        GROUP BY m.id, mlib.duration
      ),
      movie_stats AS (
        SELECT
          COUNT(DISTINCT movie_id) as movie_count,
          SUM(time_seconds * max_progress / 100.0) as total_time_seconds
        FROM movie_time
      ),
      episode_time AS (
        -- Calculer le temps passé sur chaque épisode
        -- time est en bigint, diviser par 10_00 pour obtenir les secondes
        SELECT 
          e.id as episode_id,
          e.seriesId,
          (mlib.duration / 1000) as time_seconds,
          MAX(su.watchProgress) as max_progress
        FROM Stat_User su
        INNER JOIN Episode e ON e.id = su.episodeId
        INNER JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
        WHERE su.userId = ?
          AND su.episodeId IS NOT NULL
          AND mlib.duration IS NOT NULL
        GROUP BY e.id, e.seriesId, mlib.duration
      ),
      series_stats AS (
        SELECT
          COUNT(DISTINCT seriesId) as series_count,
          COUNT(DISTINCT episode_id) as episode_count,
          SUM(time_seconds * max_progress / 100.0) as total_time_seconds
        FROM episode_time
      )
      SELECT
        -- Films (en secondes)
        COALESCE((SELECT total_time_seconds FROM movie_stats), 0) as movie_time_seconds,
        COALESCE((SELECT movie_count FROM movie_stats), 0) as movie_count,
        
        -- Séries (en secondes)
        COALESCE((SELECT total_time_seconds FROM series_stats), 0) as series_time_seconds,
        COALESCE((SELECT series_count FROM series_stats), 0) as series_count,
        COALESCE((SELECT episode_count FROM series_stats), 0) as episode_count,
        
        -- Total (en secondes)
        COALESCE((SELECT total_time_seconds FROM movie_stats), 0) + 
        COALESCE((SELECT total_time_seconds FROM series_stats), 0) as total_time_seconds
    `;

      const rows = await conn.query(query, [userId, userId]);

      if (!Array.isArray(rows) || rows.length === 0) {
        return this.getEmptyWatchTimeStats(userId);
      }

      const data = rows[0] as any;

      const movieTimeSeconds = parseFloat(data.movie_time_seconds || 0);
      const seriesTimeSeconds = parseFloat(data.series_time_seconds || 0);
      const totalTimeSeconds = parseFloat(data.total_time_seconds || 0);

      return {
        userId,
        movies: {
          totalHours: Math.floor(movieTimeSeconds / 3600),
          totalMinutes: Math.floor((movieTimeSeconds % 3600) / 60),
          totalSeconds: Math.floor(movieTimeSeconds % 60),
          contentCount: parseInt(data.movie_count || 0),
        },
        series: {
          totalHours: Math.floor(seriesTimeSeconds / 3600),
          totalMinutes: Math.floor((seriesTimeSeconds % 3600) / 60),
          totalSeconds: Math.floor(seriesTimeSeconds % 60),
          contentCount: parseInt(data.series_count || 0),
          episodeCount: parseInt(data.episode_count || 0),
        },
        total: {
          totalHours: Math.floor(totalTimeSeconds / 3600),
          totalMinutes: Math.floor((totalTimeSeconds % 3600) / 60),
          totalSeconds: Math.floor(totalTimeSeconds % 60),
          contentCount:
            parseInt(data.movie_count || 0) + parseInt(data.series_count || 0),
        },
      };
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  private getEmptyWatchTimeStats(userId: number): WatchTimeStats {
    return {
      userId,
      movies: {
        totalHours: 0,
        totalMinutes: 0,
        totalSeconds: 0,
        contentCount: 0,
      },
      series: {
        totalHours: 0,
        totalMinutes: 0,
        totalSeconds: 0,
        contentCount: 0,
        episodeCount: 0,
      },
      total: {
        totalHours: 0,
        totalMinutes: 0,
        totalSeconds: 0,
        contentCount: 0,
      },
    };
  }

  async getUserWatchingHistory(
    userId: number,
    startDate: string,
    periodType: PeriodType,
    contentType: ContentType,
  ): Promise<WatchingStatsResponse> {
    const conn = await this.pool.getConnection();

    try {
      const dateFormat = this.getDateFormat(periodType);
      const query = this.buildQuery(periodType, contentType, dateFormat);

      const rows = await conn.query(query, [
        userId,
        startDate,
        userId,
        startDate,
      ]);

      if (!Array.isArray(rows)) {
        return {
          userId,
          startDate,
          periodType,
          contentType,
          data: [],
        };
      }

      const data: DataPoint[] = (rows as any[]).map((row) => ({
        period: row.period,
        hours: parseFloat(row.total_hours || 0),
        movies: parseInt(row.movie_count || 0),
        series: parseInt(row.series_count || 0),
        episodeCount: parseInt(row.episode_count || 0),
      }));

      return {
        userId,
        startDate,
        periodType,
        contentType,
        data,
      };
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  private getDateFormat(periodType: PeriodType): string {
    switch (periodType) {
      case 'day':
        return '%Y-%m-%d';
      case 'week':
        return '%Y-W%u'; // Année + numéro de semaine
      case 'month':
        return '%Y-%m';
      case 'year':
        return '%Y';
      default:
        return '%Y-%m';
    }
  }

  private buildQuery(
    periodType: PeriodType,
    contentType: ContentType,
    dateFormat: string,
  ): string {
    let query = `
      WITH movie_data AS (
        SELECT 
          DATE_FORMAT(su.createdAt, '${dateFormat}') as period,
          m.id as content_id,
          (mlib.duration / 1000) as time_seconds,
          MAX(su.watchProgress) as max_progress
        FROM Stat_User su
        INNER JOIN Media m ON m.id = su.movieId
        INNER JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
        WHERE su.userId = ?
          AND su.movieId IS NOT NULL
          AND mlib.duration IS NOT NULL
          AND su.createdAt >= ?
        GROUP BY period, m.id, mlib.duration
      ),
      movie_stats AS (
        SELECT 
          period,
          COUNT(DISTINCT content_id) as movie_count,
          SUM(time_seconds * max_progress / 100.0) as total_seconds
        FROM movie_data
        GROUP BY period
      ),
      episode_data AS (
        SELECT 
          DATE_FORMAT(su.createdAt, '${dateFormat}') as period,
          e.id as episode_id,
          e.seriesId,
          (mlib.duration / 1000) as time_seconds,
          MAX(su.watchProgress) as max_progress
        FROM Stat_User su
        INNER JOIN Episode e ON e.id = su.episodeId
        INNER JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
        WHERE su.userId = ?
          AND su.episodeId IS NOT NULL
          AND mlib.duration IS NOT NULL
          AND su.createdAt >= ?
        GROUP BY period, e.id, e.seriesId, mlib.duration
      ),
      series_stats AS (
        SELECT 
          period,
          COUNT(DISTINCT seriesId) as series_count,
          COUNT(DISTINCT episode_id) as episode_count,
          SUM(time_seconds * max_progress / 100.0) as total_seconds
        FROM episode_data
        GROUP BY period
      )
    `;

    if (contentType === 'movies') {
      query += `
        SELECT 
          ms.period,
          COALESCE(ms.movie_count, 0) as movie_count,
          0 as series_count,
          0 as episode_count,
          ROUND(COALESCE(ms.total_seconds, 0) / 3600, 2) as total_hours
        FROM movie_stats ms
        ORDER BY ms.period ASC
      `;
    } else if (contentType === 'series') {
      query += `
        SELECT 
          ss.period,
          0 as movie_count,
          COALESCE(ss.series_count, 0) as series_count,
          COALESCE(ss.episode_count, 0) as episode_count,
          ROUND(COALESCE(ss.total_seconds, 0) / 3600, 2) as total_hours
        FROM series_stats ss
        ORDER BY ss.period ASC
      `;
    } else {
      query += `
        SELECT 
          COALESCE(ms.period, ss.period) as period,
          COALESCE(ms.movie_count, 0) as movie_count,
          COALESCE(ss.series_count, 0) as series_count,
          COALESCE(ss.episode_count, 0) as episode_count,
          ROUND((COALESCE(ms.total_seconds, 0) + COALESCE(ss.total_seconds, 0)) / 3600, 2) as total_hours
        FROM movie_stats ms
        LEFT JOIN series_stats ss ON ms.period = ss.period
        UNION
        SELECT 
          ss.period,
          COALESCE(ms.movie_count, 0) as movie_count,
          COALESCE(ss.series_count, 0) as series_count,
          COALESCE(ss.episode_count, 0) as episode_count,
          ROUND((COALESCE(ms.total_seconds, 0) + COALESCE(ss.total_seconds, 0)) / 3600, 2) as total_hours
        FROM series_stats ss
        LEFT JOIN movie_stats ms ON ss.period = ms.period
        WHERE ms.period IS NULL
        ORDER BY period ASC
      `;
    }

    return query;
  }

  public async getUserTopMedia(
    userId: number,
    mediaType: MediaTypeFilter = 'all',
  ): Promise<TopMediaResponse> {
    const conn = await this.pool.getConnection();
    try {
      const query = this.buildQueryTopMedia(mediaType);
      const rows = await conn.query(query, [userId, userId]);

      if (!Array.isArray(rows)) {
        return {
          userId,
          mediaType,
          topMedia: [],
        };
      }

      const topMedia: TopMedia[] = (rows as any[]).map((row) => ({
        rank: parseInt(row.rank),
        mediaId: parseInt(row.mediaId),
        title: row.title,
        mediaType: row.mediaType,
        description: row.description,
        date: row.date,
        resolution: row.resolution,
        posterName: this.formatPathService.getOneFormatedPosterUrl(row.mediaId.toString(), row.mediaType, row.posterName),
        posterType: row.posterType,
        watchCount: parseInt(row.watchCount),
        totalProgress: parseFloat(row.totalProgress),
        avgProgress: parseFloat(row.avgProgress),
      }));

      return {
        userId,
        mediaType,
        topMedia,
      };
    } catch (error) {
      throw error;
    } finally {
      await conn.release();
    }
  }

  private buildQueryTopMedia(mediaType: MediaTypeFilter): string {
    let mediaStatsQuery = '';

    if (mediaType === 'MOVIE') {
      // Uniquement les films
      mediaStatsQuery = `
        SELECT 
          m.id as mediaId,
          m.title,
          m.mediaType,
          m.description,
          m.date,
          mlib.resolution,
          COUNT(su.id) as watch_count,
          SUM(su.watchProgress) as total_progress,
          AVG(su.watchProgress) as avg_progress
        FROM Stat_User su
        INNER JOIN Media m ON m.id = su.movieId
        INNER JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
        WHERE su.userId = ?
          AND su.movieId IS NOT NULL
        GROUP BY m.id, m.title, m.mediaType, m.description, m.date, mlib.resolution
      `;
    } else if (mediaType === 'SERIES') {
      // Uniquement les séries
      mediaStatsQuery = `
        SELECT 
          m.id as mediaId,
          m.title,
          m.mediaType,
          m.description,
          m.date,
          mlib.resolution,
          COUNT(DISTINCT su.episodeId) as watch_count,
          SUM(su.watchProgress) as total_progress,
          AVG(su.watchProgress) as avg_progress
        FROM Stat_User su
        INNER JOIN Episode e ON e.id = su.episodeId
        INNER JOIN Media m ON m.id = e.seriesId
        INNER JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
        WHERE su.userId = ?
          AND su.episodeId IS NOT NULL
        GROUP BY m.id, m.title, m.mediaType, m.description, m.date, mlib.resolution
      `;
    } else {
      // Tous les médias (films et séries)
      mediaStatsQuery = `
        SELECT 
          m.id as mediaId,
          m.title,
          m.mediaType,
          m.description,
          m.date,
          mlib.resolution,
          COUNT(su.id) as watch_count,
          SUM(su.watchProgress) as total_progress,
          AVG(su.watchProgress) as avg_progress
        FROM Stat_User su
        INNER JOIN Media m ON m.id = su.movieId
        INNER JOIN Media_Library mlib ON mlib.id = m.mediaLibraryId
        WHERE su.userId = ?
          AND su.movieId IS NOT NULL
        GROUP BY m.id, m.title, m.mediaType, m.description, m.date, mlib.resolution
        
        UNION ALL
        
        SELECT 
          m.id as mediaId,
          m.title,
          m.mediaType,
          m.description,
          m.date,
          mlib.resolution,
          COUNT(DISTINCT su.episodeId) as watch_count,
          SUM(su.watchProgress) as total_progress,
          AVG(su.watchProgress) as avg_progress
        FROM Stat_User su
        INNER JOIN Episode e ON e.id = su.episodeId
        INNER JOIN Media m ON m.id = e.seriesId
        INNER JOIN Media_Library mlib ON mlib.id = e.mediaLibraryId
        WHERE su.userId = ?
          AND su.episodeId IS NOT NULL
        GROUP BY m.id, m.title, m.mediaType, m.description, m.date, mlib.resolution
      `;
    }

    return `
      WITH media_stats AS (
        ${mediaStatsQuery}
      ),
      ranked_media AS (
        SELECT 
          mediaId,
          title,
          mediaType,
          description,
          date,
          resolution,
          watch_count,
          total_progress,
          avg_progress,
          (watch_count * 100 + total_progress) as score,
          ROW_NUMBER() OVER (ORDER BY (watch_count * 100 + total_progress) DESC) as media_rank
        FROM media_stats
      ),
      top_10_media AS (
        SELECT * 
        FROM ranked_media 
        WHERE media_rank <= 10
        ORDER BY media_rank
      ),
      poster_priority AS (
        SELECT 
          mp.mediaId,
          p.name as posterName,
          mp.type as posterType,
          CASE 
            WHEN mp.type = 'SPECIAL' THEN 1
            WHEN mp.type = 'NORMAL' THEN 2
            WHEN mp.type = 'LICENSE' THEN 3
            ELSE 4
          END as priority,
          ROW_NUMBER() OVER (
            PARTITION BY mp.mediaId 
            ORDER BY 
              CASE 
                WHEN mp.type = 'SPECIAL' THEN 1
                WHEN mp.type = 'NORMAL' THEN 2
                WHEN mp.type = 'LICENSE' THEN 3
                ELSE 4
              END
          ) as poster_rank
        FROM top_10_media tm
        INNER JOIN Media_Poster mp ON mp.mediaId = tm.mediaId
        INNER JOIN Poster p ON p.id = mp.posterId
        WHERE mp.type IN ('SPECIAL', 'NORMAL', 'LICENSE')
      )
      SELECT 
        tm.media_rank as rank,
        tm.mediaId,
        tm.title,
        tm.mediaType,
        tm.description,
        DATE_FORMAT(tm.date, '%Y-%m-%d') as date,
        tm.resolution,
        pp.posterName,
        pp.posterType,
        tm.watch_count as watchCount,
        ROUND(tm.total_progress, 2) as totalProgress,
        ROUND(tm.avg_progress, 2) as avgProgress
      FROM top_10_media tm
      LEFT JOIN poster_priority pp ON pp.mediaId = tm.mediaId AND pp.poster_rank = 1
      ORDER BY tm.media_rank ASC
    `;
  }
}