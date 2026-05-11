import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ParseFilePathService } from 'src/common-service/parse-file-path.service';

// ─────────────────────────────────────────────────────────────────────────────
// DTOs internes au scanner
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedEpisode {
  seriesTitle: string;
  year: number | undefined;
  seasonNumber: number | undefined;
  episodeNumber: number | undefined;
  filePath: string;
}

export interface ScannedEpisode {
  filePath: string;
  episodeNumber: number;
}

export interface ScannedSeason {
  seasonNumber: number;
  folderPath: string;
  episodes: ScannedEpisode[];
}

export interface ScannedSeries {
  seriesTitle: string;
  year: number | undefined;
  folderPath: string;
  seasons: ScannedSeason[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Détecte le numéro d'épisode (et optionnellement de saison) dans un nom de fichier.
 * Ordre de priorité décroissante (style Jellyfin).
 */
const SE_PATTERNS: RegExp[] = [
  // S01E03 / S01E03E04
  /[Ss](?<season>\d{1,4})[Ee](?<episode>\d{1,4})/,
  // 1x03
  /(?<![.\d])(?<season>\d{1,2})x(?<episode>\d{2,4})(?![.\d])/i,
  // Season 1 Episode 3 / Saison 1 Episode 3
  /(?:season|saison|s)\s*(?<season>\d{1,4})\s*(?:episode|ep|e)\s*(?<episode>\d{1,4})/i,
  // EP03 / E03 seul
  /\bep?(?<episode>\d{2,4})\b/i,
  // "- 10 " ou "- 50 " : numéro isolé précédé d'un tiret-espace et suivi d'un espace ou fin de nom
  // Couvre : "[Group] Series - 10 TAG", "[Group] Series - 10"
  /(?<=\s-\s)(?<episode>\d{1,4})(?=\s|$)/,
];

/**
 * Détecte le numéro de saison depuis le nom d'un dossier de depth 2.
 * Couvre : S01, S1, Season 1, Saison 01, Saison 0, Bonus, Specials, OVA…
 * Le groupe `special` indique une saison 0 (bonus/hors-série).
 */
const SEASON_FOLDER_PATTERN =
  /^(?:s(?:aison|eason)?\s*(?<season>\d{1,4})|(?<special>bonus|specials?|extras?|ova|hors[- ]?s[eé]rie|sp))\b/i;

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
   * Structure attendue sur le disque (identique à Jellyfin) :
   *
   *   rootDir/
   *     SeriesName/            ← depth 1 → SÉRIE
   *       S01/ ou Saison 1/    ← depth 2 → SAISON
   *         episode.mkv        ← depth 3+ → ÉPISODE
   *
   * Tout sous-dossier supplémentaire (ex: nom de release) est ignoré :
   * on descend jusqu'au premier fichier vidéo trouvé.
   */
  public async scanSeriesDirectory(rootDir: string): Promise<ScannedSeries[]> {
    // On liste les dossiers de depth 1 (chaque dossier = une série)
    const seriesDirs = await this.listSubDirectories(rootDir);
    const result: ScannedSeries[] = [];

    for (const seriesDir of seriesDirs) {
      const scanned = await this.scanOneSeries(seriesDir, rootDir);
      if (scanned) result.push(scanned);
    }

    return result.sort((a, b) =>
      a.seriesTitle.localeCompare(b.seriesTitle),
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SCAN D'UNE SÉRIE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Scanne un dossier de depth 1 (= une série).
   * Ses sous-dossiers directs sont traités comme des saisons.
   * Les fichiers vidéo directement à la racine sont ignorés
   * (ils appartiennent à une saison implicite si nécessaire — cf. Jellyfin).
   */
  private async scanOneSeries(
    seriesDir: string,
    rootDir: string,
  ): Promise<ScannedSeries | null> {
    // Titre de la série = nom du dossier depth 1, nettoyé
    const parsed = this.parseFilePathService.getCleanMediaTitle(
      path.basename(seriesDir),
    );
    const seriesTitle = parsed.name;
    const year        = parsed.year;

    if (!seriesTitle) return null;

    const seasons: ScannedSeason[] = [];

    // Liste les entrées du dossier série
    const entries = await fs.readdir(seriesDir, { withFileTypes: true });

    // ── Dossiers depth 2 → saisons ───────────────────────────────────────
    const subDirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('.'),
    );

    // Fichiers vidéo directement dans le dossier série (structure plate rare)
    const rootVideos = entries.filter(
      (e) => e.isFile() && this.isVideo(e.name),
    );

    for (const subDir of subDirs) {
      const seasonFolderPath = path.join(seriesDir, subDir.name);
      const seasonNumber     = this.parseSeasonNumber(subDir.name);

      const videoFiles = await this.getAllVideoFiles(seasonFolderPath);
      if (videoFiles.length === 0) continue;

      // Tri alphabétique des fichiers avant attribution des index
      const sortedFiles = [...videoFiles].sort((a, b) =>
        path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
      );

      // Premier passage : on tente de parser le numéro d'épisode depuis le nom
      const rawEpisodes = sortedFiles.map((filePath) => ({
        filePath,
        episodeNumber: this.parseEpisodeNumber(path.basename(filePath), seasonNumber),
      }));

      // Si TOUS les épisodes de la saison sont sans numéro reconnu → index positionnel
      // Si CERTAINS seulement sont sans numéro → on les laisse à 0 (bonus isolés)
      const allUnknown = rawEpisodes.every((e) => e.episodeNumber === undefined);

      const episodes: ScannedEpisode[] = rawEpisodes.map((e, idx) => ({
        filePath:      e.filePath,
        episodeNumber: e.episodeNumber
          ?? (allUnknown ? idx + 1 : 0),
      }));

      episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

      seasons.push({
        seasonNumber,
        folderPath: seasonFolderPath,
        episodes,
      });
    }

    // ── Fichiers vidéo à la racine de la série → saison 1 implicite ──────
    if (rootVideos.length > 0) {
      const sortedRootVideos = [...rootVideos].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      const rawImplicit = sortedRootVideos.map((e) => ({
        filePath:      path.join(seriesDir, e.name),
        episodeNumber: this.parseEpisodeNumber(e.name, 1),
      }));

      const allUnknown = rawImplicit.every((e) => e.episodeNumber === undefined);

      const implicitEpisodes: ScannedEpisode[] = rawImplicit.map((e, idx) => ({
        filePath:      e.filePath,
        episodeNumber: e.episodeNumber ?? (allUnknown ? idx + 1 : 0),
      }));

      implicitEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

      // Fusionne avec une éventuelle saison 1 déjà détectée via dossier
      const existing = seasons.find((s) => s.seasonNumber === 1);
      if (existing) {
        existing.episodes.push(...implicitEpisodes);
        existing.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      } else {
        seasons.push({
          seasonNumber: 1,
          folderPath:   seriesDir,
          episodes:     implicitEpisodes,
        });
      }
    }

    if (seasons.length === 0) return null;

    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

    return { seriesTitle, year, folderPath: seriesDir, seasons };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PARSING SAISON / ÉPISODE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Extrait le numéro de saison depuis le nom d'un dossier de depth 2.
   *
   * Exemples reconnus :
   *   S01, S1, Season 1, Saison 01, Saison 0,
   *   Bonus, Specials, OVA, Hors-série  → 0
   *
   * Fallback : 0 si le dossier ne ressemble à rien de connu.
   */
  private parseSeasonNumber(folderName: string): number {
    const m = folderName.match(SEASON_FOLDER_PATTERN);
    if (!m) return 0; // dossier non reconnu → saison 0
    if (m.groups?.special) return 0;
    return parseInt(m.groups!.season, 10);
  }

  /**
   * Extrait le numéro d'épisode depuis le nom d'un fichier vidéo.
   * Retourne undefined si aucun pattern ne correspond.
   */
  private parseEpisodeNumber(
    filename: string,
    seasonNumber: number,
  ): number | undefined {
    const name = path.basename(filename, path.extname(filename));
    for (const pattern of SE_PATTERNS) {
      const m = name.match(pattern);
      if (m?.groups?.episode) {
        // Si le pattern contient aussi la saison, on vérifie la cohérence
        if (m.groups.season !== undefined) {
          const fileSeason = parseInt(m.groups.season, 10);
          // On accepte même si la saison du fichier diffère (le dossier fait foi)
          // mais on garde le numéro d'épisode du fichier
        }
        return parseInt(m.groups.episode, 10);
      }
    }
    return undefined;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UTILITAIRES PRIVÉS
  // ───────────────────────────────────────────────────────────────────────────

  private isVideo(filename: string): boolean {
    return this.VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
  }

  private async listSubDirectories(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name));
  }

  /**
   * Parcours récursif : collecte tous les fichiers vidéo sous `dir`.
   * Gère les dossiers de release imbriqués (ex: depth 3+).
   */
  private async getAllVideoFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) return [];
        if (path.extname(entry.name).toLowerCase() === '.lnk') return [];
        if (entry.isDirectory()) return this.getAllVideoFiles(fullPath);
        return this.isVideo(entry.name) ? [fullPath] : [];
      }),
    );
    return files.flat();
  }

  private normalizePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .toLowerCase();
  }
}