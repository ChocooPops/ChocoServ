import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ParseFilePathService } from 'src/common-service/parse-file-path.service';

// ─────────────────────────────────────────────────────────────────────────────
// DTOs internes au scanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Résultat de l'extraction S/E depuis un nom de fichier.
 */
export interface ParsedEpisode {
  /** Titre de la série nettoyé (ex: "Breaking Bad") */
  seriesTitle: string;
  /** Année extraite du nom de fichier (peut être undefined) */
  year: number | undefined;
  /** Numéro de saison (1-based). undefined si non détecté. */
  seasonNumber: number | undefined;
  /** Numéro d'épisode (1-based). undefined si non détecté. */
  episodeNumber: number | undefined;
  /** Chemin absolu du fichier */
  filePath: string;
}

/**
 * Un épisode prêt à être inséré en base.
 */
export interface ScannedEpisode {
  filePath: string;
  episodeNumber: number;
}

/**
 * Une saison regroupant ses épisodes, triés par episodeNumber.
 */
export interface ScannedSeason {
  seasonNumber: number;
  /** Chemin du dossier de la saison (ou dossier parent si flat). Utilisé comme path dans Media_Library. */
  folderPath: string;
  episodes: ScannedEpisode[];
}

/**
 * Une série complète avec toutes ses saisons/épisodes, prête pour l'insertion.
 */
export interface ScannedSeries {
  /** Titre propre pour la recherche TMDB */
  seriesTitle: string;
  year: number | undefined;
  /** Chemin du dossier racine de la série */
  folderPath: string;
  seasons: ScannedSeason[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Patterns de détection S##E##
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordre de priorité décroissante:
 *
 * 1. SxxExx  →  S01E03  (insensible à la casse)
 * 2. xXxx    →  1x03    (format alternatif "1x03")
 * 3. Dossier Season XX / Saison XX  (fallback sur le dossier parent)
 * 4. Numéro d'épisode seul en dernier recours (ex: EP03, E03)
 *
 * Chaque pattern expose deux groupes nommés : `season` et `episode`.
 */
const SE_PATTERNS: RegExp[] = [
  // S01E03 / S01E03E04 (multi-épisode → on prend le premier)
  /[Ss](?<season>\d{1,4})[Ee](?<episode>\d{1,4})/,
  // 1x03
  /(?<![.\d])(?<season>\d{1,2})x(?<episode>\d{2,4})(?![.\d])/i,
  // Season 1 Episode 3 / Saison 1 Episode 3
  /(?:season|saison|s)\s*(?<season>\d{1,4})\s*(?:episode|ep|e)\s*(?<episode>\d{1,4})/i,
  // EP03 / E03 seul (season inconnue → sera mise à 1)
  /\bep?(?<episode>\d{2,4})\b/i,
];

/**
 * Détecte le numéro de saison depuis le nom d'un dossier.
 * Exemples : "Season 1", "Saison 02", "S1", "S01"
 */
const SEASON_FOLDER_PATTERN =
  /(?:season|saison|s(?:eason)?)\s*(?<season>\d{1,4})/i;

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SeriesScannerService {
  private readonly VIDEO_EXTENSIONS = new Set([
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  ]);

  constructor(private readonly parseFilePathService: ParseFilePathService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // API PUBLIQUE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Point d'entrée principal.
   *
   * Lit récursivement `rootDir`, groupe les fichiers vidéo par série/saison
   * et retourne un tableau de `ScannedSeries` triées et ordonnées, prêtes
   * à être envoyées à TMDB puis insérées en base.
   *
   *   1. Extraction du pattern SxxExx dans le nom de fichier.
   *   2. Fallback sur le nom du dossier parent (Season X / Saison X).
   *   3. Regroupement par titre de série nettoyé (insensible à la casse).
   *   4. Tri des saisons et des épisodes par numéro croissant.
   */
  public async scanSeriesDirectory(rootDir: string): Promise<ScannedSeries[]> {
    const allVideoFiles = await this.getAllVideoFiles(rootDir);
    const parsedEpisodes = allVideoFiles.map((filePath) =>
      this.parseEpisodeFromPath(filePath, rootDir),
    );

    return this.groupIntoSeries(parsedEpisodes, rootDir);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PARSING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Extrait les informations série/saison/épisode depuis le chemin complet
   * d'un fichier vidéo.
   *
   * Stratégie :
   *
   * 1. Chercher un pattern SxxExx dans le **nom du fichier** (sans extension).
   * 2. Si la saison n'est pas trouvée dans le nom de fichier, regarder le
   *    **nom du dossier parent** (Season 1, Saison 02, S01…).
   * 3. Si toujours pas de saison → saison 1 par défaut.
   * 4. Extraire le titre de la série :
   *    - Tout ce qui précède le pattern SxxExx dans le nom de fichier.
   *    - Sinon, si la structure est rootDir/SeriesName/Season X/fichier.mkv,
   *      prendre le nom du dossier grand-parent.
   *    - Sinon, utiliser ParseFilePathService pour nettoyer le nom du fichier.
   */
  public parseEpisodeFromPath(
    filePath: string,
    rootDir: string,
  ): ParsedEpisode {
    const filename = path.basename(filePath, path.extname(filePath));
    const parentDir = path.dirname(filePath);
    const parentName = path.basename(parentDir);
    const grandParentDir = path.dirname(parentDir);
    const grandParentName = path.basename(grandParentDir);

    // ── Étape 1 : pattern S/E dans le nom de fichier ──────────────────────
    let seasonNumber: number | undefined;
    let episodeNumber: number | undefined;
    let titleRaw = filename;

    for (const pattern of SE_PATTERNS) {
      const match = filename.match(pattern);
      if (match?.groups?.episode) {
        episodeNumber = parseInt(match.groups.episode, 10);
        if (match.groups?.season) {
          seasonNumber = parseInt(match.groups.season, 10);
        }
        // Tout ce qui précède le match = titre brut de la série
        titleRaw = filename.slice(0, match.index ?? 0).trim();
        break;
      }
    }

    // ── Étape 2 : saison depuis le dossier parent si non trouvée ──────────
    if (seasonNumber === undefined) {
      const seasonFolderMatch = parentName.match(SEASON_FOLDER_PATTERN);
      if (seasonFolderMatch?.groups?.season) {
        seasonNumber = parseInt(seasonFolderMatch.groups.season, 10);
      }
    }

    // ── Étape 3 : saison par défaut = 1 ───────────────────────────────────
    if (seasonNumber === undefined) {
      seasonNumber = 1;
    }

    // ── Étape 4 : titre de la série ───────────────────────────────────────
    let seriesTitle: string;
    let year: number | undefined;

    const isInsideSeasonFolder = SEASON_FOLDER_PATTERN.test(parentName);

    if (titleRaw.trim().length > 0) {
      // Cas le plus fréquent : "Breaking.Bad.S01E03.mkv"
      // → titleRaw = "Breaking.Bad." → nettoyé = "Breaking Bad"
      const parsed = this.parseFilePathService.getCleanMediaTitle(titleRaw);
      seriesTitle = parsed.name;
      year = parsed.year;
    } else if (isInsideSeasonFolder) {
      // Structure : rootDir/Breaking Bad/Season 1/E01.mkv
      // → grandParentName est le nom de la série si ce n'est pas rootDir
      const isGrandParentRoot =
        this.normalizePath(grandParentDir) === this.normalizePath(rootDir);
      if (!isGrandParentRoot) {
        const parsed = this.parseFilePathService.getCleanMediaTitle(grandParentName);
        seriesTitle = parsed.name;
        year = parsed.year;
      } else {
        // rootDir/Season 1/E01.mkv → pas de titre exploitable
        const parsed = this.parseFilePathService.getCleanMediaTitle(parentName);
        seriesTitle = parsed.name;
        year = parsed.year;
      }
    } else {
      // Structure plate : rootDir/Breaking Bad/E01.mkv ou rootDir/fichier.mkv
      const isParentRoot =
        this.normalizePath(parentDir) === this.normalizePath(rootDir);
      const nameSource = isParentRoot ? filename : parentName;
      const parsed = this.parseFilePathService.getCleanMediaTitle(nameSource);
      seriesTitle = parsed.name;
      year = parsed.year;
    }

    return { seriesTitle, year, seasonNumber, episodeNumber, filePath };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REGROUPEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regroupe une liste plate de `ParsedEpisode` en `ScannedSeries[]`.
   *
   * Règles :
   * - Clé de regroupement = titre normalisé (minuscules, espaces normalisés).
   * - Dans chaque série, les saisons sont triées par `seasonNumber` croissant.
   * - Dans chaque saison, les épisodes sont triés par `episodeNumber` croissant.
   * - Les épisodes sans numéro détecté sont placés en fin de saison, triés
   *   par nom de fichier.
   * - Le `folderPath` d'une saison = dossier commun des épisodes de cette saison.
   * - Le `folderPath` d'une série = dossier commun des saisons de cette série.
   */
  private groupIntoSeries(
    parsedEpisodes: ParsedEpisode[],
    rootDir: string,
  ): ScannedSeries[] {
    // Map<normalizedTitle, ScannedSeries>
    const seriesMap = new Map<string, ScannedSeries>();

    for (const ep of parsedEpisodes) {
      const key = this.normalizeTitle(ep.seriesTitle);

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          seriesTitle: ep.seriesTitle,
          year: ep.year,
          folderPath: path.dirname(ep.filePath), // sera recalculé
          seasons: [],
        });
      }

      const series = seriesMap.get(key)!;
      const seasonNum = ep.seasonNumber ?? 1;

      let season = series.seasons.find((s) => s.seasonNumber === seasonNum);
      if (!season) {
        season = {
          seasonNumber: seasonNum,
          folderPath: path.dirname(ep.filePath), // sera recalculé
          episodes: [],
        };
        series.seasons.push(season);
      }

      season.episodes.push({
        filePath: ep.filePath,
        episodeNumber: ep.episodeNumber ?? this.episodeFallbackIndex(season),
      });
    }

    // ── Post-traitement : tri + calcul des folderPaths ──────────────────────
    for (const series of seriesMap.values()) {
      // Trier les saisons
      series.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

      for (const season of series.seasons) {
        // Trier les épisodes (épisodes sans numéro → placés à la fin via index énorme)
        season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        // folderPath = dossier commun de tous les épisodes de cette saison
        season.folderPath = this.commonAncestorDir(
          season.episodes.map((e) => e.filePath),
        );
      }

      // folderPath de la série = dossier commun de toutes les saisons
      series.folderPath = this.commonAncestorDir(
        series.seasons.map((s) => s.folderPath),
      );

      // Conserver l'année la plus fréquente (ou la première trouvée)
      if (!series.year) {
        const firstWithYear = parsedEpisodes.find(
          (e) => this.normalizeTitle(e.seriesTitle) === this.normalizeTitle(series.seriesTitle) && e.year,
        );
        series.year = firstWithYear?.year;
      }
    }

    // Trier les séries par titre
    return [...seriesMap.values()].sort((a, b) =>
      a.seriesTitle.localeCompare(b.seriesTitle),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UTILITAIRES PRIVÉS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renvoie un numéro très grand pour les épisodes sans numéro détecté,
   * de sorte qu'ils soient placés en fin de liste mais triés entre eux
   * par ordre d'insertion (= ordre alphabétique du scan).
   */
  private episodeFallbackIndex(season: ScannedSeason): number {
    return 99000 + season.episodes.length;
  }

  /**
   * Trouve le répertoire commun (ancêtre le plus proche) d'une liste de chemins.
   * Ex: ["/a/b/c/file.mkv", "/a/b/d/file.mkv"] → "/a/b"
   */
  private commonAncestorDir(filePaths: string[]): string {
    if (filePaths.length === 0) return '';
    if (filePaths.length === 1) return path.dirname(filePaths[0]);

    const dirs = filePaths.map((p) =>
      (path.extname(p) ? path.dirname(p) : p).split(path.sep),
    );
    const first = dirs[0];
    let i = 0;
    while (
      i < first.length &&
      dirs.every((d) => d[i] === first[i])
    ) {
      i++;
    }
    return first.slice(0, i).join(path.sep) || path.sep;
  }

  /**
   * Normalise un titre pour la clé de regroupement :
   * minuscules, espaces normalisés, ponctuation supprimée.
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  /** Parcours récursif identique à getAllVideoFiles du LibraryService. */
  private async getAllVideoFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.resolve(dir, entry.name);

        if (entry.isSymbolicLink()) return [];
        if (path.extname(entry.name).toLowerCase() === '.lnk') return [];

        if (entry.isDirectory()) {
          return this.getAllVideoFiles(fullPath);
        }

        const ext = path.extname(entry.name).toLowerCase();
        return this.VIDEO_EXTENSIONS.has(ext) ? [fullPath] : [];
      }),
    );
    return files.flat();
  }
}