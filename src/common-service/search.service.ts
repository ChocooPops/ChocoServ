import { Injectable } from "@nestjs/common";
import { SearchItem } from "src/common-interface/search-item.interface";

@Injectable()
export class SearchService {

    public levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
            Array(b.length + 1).fill(0)
        );

        for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[a.length][b.length];
    }

    public normalizedKeyword(keyWord: string): string {
        return keyWord
            .normalize('NFD')                   // Décompose "é" → "e" + accent
            .replace(/[\u0300-\u036f]/g, '')    // Supprime les accents
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')        // Supprime les caractères spéciaux
            .replace(/\s+/g, ' ')               // Collapse les espaces multiples
            .trim();
    }

    // public formatCharacterString(character: string): string {
    //     return character
    //         .toLowerCase() // Met tout en minuscules
    //         .normalize('NFD') // Décompose les accents
    //         .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    //         .replace(/[^a-z0-9\s]/g, '') // Supprime les caractères spéciaux
    //         .replace(/\s+/g, ' ') // Remplace plusieurs espaces par un seul
    //         .trim(); // Supprime les espaces au début et à la fin
    // }

    public getMaxDistance(): number {
        return 1;
    }

    public deleteUselessCharacterString(titleTab: string[]): string[] {
        const stopWords = {
            french: [
                "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
                "ce", "cet", "cette", "ces",
                "à", "en", "dans", "sur", "sous", "chez", "avec", "sans", "par", "pour", "de", "d'", "vers"
            ],
            german: [
                "der", "die", "das", "ein", "eine", "einen", "einer", "einem", "den", "dem", "des",
                "dieser", "diese", "dieses", "jeder", "jede", "jedes",
                "in", "auf", "an", "unter", "über", "mit", "nach", "zu", "zum", "zur", "von", "aus", "bei", "durch", "ohne", "während"
            ],
            english: [
                "the", "a", "an",
                "this", "that", "these", "those",
                "in", "on", "at", "by", "to", "from", "with", "about", "as", "for", "of", "under", "over", "between", "without"
            ],
            italian: [
                "il", "lo", "la", "i", "gli", "le", "un", "una", "uno",
                "questo", "questa", "questi", "queste", "quello", "quella", "quelli", "quelle",
                "di", "del", "della", "dei", "degli", "nelle", "nel", "nella", "sul", "sulla", "con", "tra", "fra", "per", "senza"
            ],
            spanish: [
                "el", "la", "los", "las", "un", "una", "unos", "unas",
                "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
                "de", "del", "en", "a", "al", "por", "para", "con", "sin", "sobre", "entre", "hacia", "desde"
            ]
        };

        const allStopWords = Object.values(stopWords).flat();
        return titleTab.filter(word => !allStopWords.includes(word.toString()));
    }

    public getItemByResearch(keyWord: string, data: SearchItem[]): number[] {
        const mediaApproximative: { data: SearchItem, score: number }[] = [];
        const mediaWanted: { data: SearchItem, score: number }[] = [];
        const medias: number[] = [];
        keyWord = this.normalizedKeyword(keyWord);
        const keyWordTab: string[] = keyWord.split(' ');

        for (const media of data) {
            const title = this.normalizedKeyword(media.title);
            if (title.startsWith(keyWord.toString())) {
                const distance = this.levenshteinDistance(title, keyWord.toString());
                mediaWanted.push({
                    score: distance,
                    data: media
                });
                continue;
            }

            const titleTab: string[] = this.deleteUselessCharacterString(title.split(' '));
            let found = false;

            for (const keyWordField of keyWordTab) {
                for (const titleField of titleTab) {
                    const distance = this.levenshteinDistance(keyWordField, titleField);
                    if (distance <= this.getMaxDistance()) {
                        mediaApproximative.push({ data: media, score: distance });
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
        }

        mediaWanted
            .sort((a, b) => {
                if (a.score === b.score) {
                    return a.data.title.localeCompare(b.data.title);
                }
                return a.score - b.score;
            })
            .forEach(resutl => medias.push(resutl.data.id));

        mediaApproximative
            .sort((a, b) => {
                if (a.score === b.score) {
                    return a.data.title.localeCompare(b.data.title);
                }
                return a.score - b.score;
            })
            .forEach(result => medias.push(result.data.id));
        return medias;
    }

}