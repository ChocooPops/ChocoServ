import { Injectable } from "@nestjs/common";
import { ParsedName } from "src/library/dto/parsed-name";
/**
 * Reproduces Jellyfin's two-step movie name cleaning pipeline:
 * 1. parseName()  — mimics ILibraryManager.ParseName()
 * 2. cleanName()  — reproduces TmdbUtils.CleanName()
 */

@Injectable({})
export class ParseFilePathService {

    // ─── Patterns used by parseName ────────────────────────────────────────────

    /**
     * Année de sortie — doit être PRÉCÉDÉE d'un séparateur (., _, espace, parenthèse)
     * pour ne pas confondre un titre numérique comme "1917" avec une année.
     *
     * Lookahead : l'année doit être suivie d'un séparateur ou d'un tag technique connu,
     * ce qui garantit qu'elle n'est pas elle-même le titre.
     */
    private YEAR_PATTERN =
    /(?<=[.\s_({\[])((19|20)\d{2})(?=[.\s_)}\]]|$)/;

    /** Résolutions vidéo */
    private RESOLUTION_PATTERN =
    /\b(?:4k(?:light)?|2160p?|1080[pi]?|720p?|480[pi]?|360p?|uhd|fhd|hd)\b/i;

    /** Sources / encodages */
    private SOURCE_PATTERN =
    /\b(?:blu[- ]?ray|bluray|bdrip|brrip|dvd(?:rip|scr)?|web[- ]?(?:dl|rip)|webrip|hdtv|pdtv|dsr|ts|cam|hdrip|remux|bdremux)\b/i;

    /** Codecs vidéo */
    private VIDEO_CODEC_PATTERN =
    /\b(?:x26[45]|h\.?26[45]|hevc|avc|xvid|divx|mpeg2|vp9|av1|10bit|hi10p)\b/i;

    /** Codecs audio */
    private AUDIO_CODEC_PATTERN =
    /\b(?:dts(?:[- ]?(?:hd|ma|x|es))?|dolby(?:[- ]?(?:atmos|vision|digital))?|truehd|aac|ac3|mp3|flac|eac3|opus|dd(?:\+|p)?(?:5\.1|7\.1)?|5\.1|7\.1)\b/i;

    /** Langues / sous-titres */
    private LANGUAGE_PATTERN =
    /\b(?:multi|french|vf|vfi|vff|vo|vost(?:fr)?|english|german|spanish|italian|dubbed|sub(?:bed)?|hdlight)\b/i;

    /** Tags HDR / gamme de couleurs */
    private HDR_PATTERN = /\b(?:hdr(?:10(?:\+|plus)?)?|dolby[- ]?vision|dv|hlg|sdr)\b/i;

    /** Tags de release (groupes, versions) */
    private RELEASE_TAG_PATTERN = /\b(?:proper|repack|extended|directors?[- ]?cut|unrated|theatrical|imax|v\d+)\b/i;

    /** Groupe de release en fin de nom : -QTZ / -GROUP */
    private RELEASE_GROUP_PATTERN = /-[A-Z0-9]{2,10}$/i;

    /** Tout ce qui reste entre crochets ou parenthèses après nettoyage */
    private BRACKET_JUNK_PATTERN = /[\[({\])}]/g;

    /** Séparateurs (points, underscores, tirets multiples) */
    private SEPARATOR_PATTERN = /[._]+|(?<!\w)-(?!\w)/g;

    /**
     * Étape 1 : Reproduit ILibraryManager.ParseName()
     *
     * Extrait le titre propre et l'année à partir d'un nom de fichier brut
     * (sans extension).
     */

    parseName(filename: string): ParsedName {
        let name = filename;

        // 1. Extraire l'année avant tout nettoyage (on la capture pour la retourner)
        let year: number | undefined;
        const yearMatch = name.match(this.YEAR_PATTERN);
        if (yearMatch) {
            const candidate = parseInt(yearMatch[1], 10);
            if (candidate >= 1888 && candidate <= new Date().getFullYear() + 1) {
            const cutIndex = yearMatch.index ?? name.length;
            // Garde : ne tronquer que si le titre résultant n'est pas vide
            // (évite le cas où l'année EST le titre, ex: "1917")
            const candidateTitle = name.slice(0, cutIndex).trim();
            if (candidateTitle.length > 0) {
                year = candidate;
                name = candidateTitle;
            }
            }
        }

        // 2. Retirer les patterns techniques (ordre important : du plus spécifique au plus général)
        name = name
            .replace(this.RELEASE_GROUP_PATTERN, "")
            .replace(this.RELEASE_TAG_PATTERN, " ")
            .replace(this.HDR_PATTERN, " ")
            .replace(this.AUDIO_CODEC_PATTERN, " ")
            .replace(this.VIDEO_CODEC_PATTERN, " ")
            .replace(this.SOURCE_PATTERN, " ")
            .replace(this.RESOLUTION_PATTERN, " ")
            .replace(this.LANGUAGE_PATTERN, " ");

        // 3. Nettoyer les crochets/parenthèses résiduels
        name = name.replace(this.BRACKET_JUNK_PATTERN, " ");

        // 4. Remplacer les séparateurs par des espaces
        name = name.replace(this.SEPARATOR_PATTERN, " ");

        // 5. Normaliser les espaces multiples et trimmer
        name = name.replace(/\s{2,}/g, " ").trim();

        return { name, year };
    }

    cleanName(name: string): string {
        // Équivalent de [\W_-[·]]+ en .NET, avec support Unicode complet.
        // \w en JS = [a-zA-Z0-9_] uniquement → les accents (é, à, ü...) sautent.
        // On utilise les propriétés Unicode \p{L} (lettres) et \p{N} (chiffres)
        // pour couvrir tous les alphabets, plus le point médian · explicitement.
        // Le flag `u` est requis pour \p{}.
        return name.replace(/[^\p{L}\p{N}·]+/gu, " ").trim();
    }

    getCleanMediaTitle(filename: string): ParsedName {
        const parsed = this.parseName(filename);
        const name = this.cleanName(parsed.name);
        return { name, year: parsed.year };
    }

}