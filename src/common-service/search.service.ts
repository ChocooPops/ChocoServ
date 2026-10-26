import { Injectable } from "@nestjs/common";
import { LikePatterns } from "src/common-interface/like-patterns.interface";
import { MatchScore } from "src/common-interface/match-score.interface";
import { MatchType } from "src/common-interface/match-type.enum";
import { SearchQuery } from "src/common-interface/search-query.interface";

@Injectable()
export class SearchService {

    private readonly MAX_LENGTH: number = 60;
    private readonly MIN_INSIDE_WORD_LENGTH: number = 3;
    private readonly MIN_PREFIX_TYPO_LENGTH: number = 6;
    private readonly MIN_PARTIAL_COVERAGE: number = 0.5;
    private readonly NO_SPACE_SCRIPTS: RegExp = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

    public normalizedKeyword(keyWord: string): string {
        return keyWord
            .normalize('NFD')                   // Décompose "é" → "e" + accent
            .replace(/[\u0300-\u036f]/g, '')    // Supprime les accents
            .toLowerCase()
            .replace(/[%_]/g, '')               // Supprime les wildcards SQL (% et _)
            .replace(/\s+/g, ' ')               // Collapse les espaces multiples
            .trim();
    }

    public replaceWithUnderscores(str: string, iterations: number): string[] {
        str = str.slice(0, this.MAX_LENGTH);
        const result: string[] = [];
        const n = str.length;

        function combine(count: number, start: number, chosen: number[]) {
            if (chosen.length === count) {
                const chars = str.split("");
                for (const idx of chosen) {
                    chars[idx] = "%";
                }
                const generated = chars.join("");
                result.push(generated);
                return;
            }

            for (let i = start; i < n; i++) {
                chosen.push(i);
                combine(count, i + 1, chosen);
                chosen.pop();
            }
        }

        for (let count = 1; count <= iterations; count++) {
            combine(count, 0, []);
        }
        
        return result;
    }

    public addUnderscoresAfterEachLetterVariants(str: string, iterations: number): string[] {
        str = str.slice(0, this.MAX_LENGTH);
        const result: string[] = [];
        const n = str.length;
        const totalGaps = n + 1;

        function combine(count: number, start: number, chosen: number[]) {
            if (chosen.length === count) {
                const chars = str.split("");
                for (let k = chosen.length - 1; k >= 0; k--) {
                    chars.splice(chosen[k], 0, "%");
                }
                const generated = chars.join("");
                result.push(generated);
                return;
            }

            for (let i = start; i < totalGaps; i++) {
                chosen.push(i);
                combine(count, i + 1, chosen);
                chosen.pop();
            }
        }

        for (let count = 1; count <= iterations; count++) {
            combine(count, 0, []);
        }

        return result;
    }

    public levenshtein(a: string, b: string): number {
        const m = a.length;
        const n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // suppression
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
            }
        }

        return dp[m][n];
    }

    // Comme normalizedKeyword, mais la ponctuation devient un espace : "Spider-Man: No Way Home" → "spider man no way home"
    public normalizedText(text: string): string {
        return text
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')        // Supprime les accents
            .toLowerCase()
            .replace(/œ/g, 'oe')
            .replace(/æ/g, 'ae')
            .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')  // Ponctuation, symboles et wildcards SQL → espace
            .trim()
            .normalize('NFC');                      // Recompose le japonais et le coréen
    }

    public getSearchQuery(keyWord: string): SearchQuery {
        const text = this.normalizedText(keyWord.slice(0, this.MAX_LENGTH));
        return {
            text,
            noSpace: text.replace(/ /g, ''),
            tokens: [...new Set(text.split(' ').filter(Boolean))]
        };
    }

    // Un mot-clé court ("le", "x") n'est cherché qu'en début de mot, sauf dans les écritures sans espaces (japonais, chinois, coréen)
    public canMatchInsideWord(token: string): boolean {
        return token.length >= this.MIN_INSIDE_WORD_LENGTH || this.NO_SPACE_SCRIPTS.test(token);
    }

    // Une faute de frappe tolérée, sauf sur les mots-clés courts et les nombres ("2" ≠ "3")
    public getMaxTypos(token: string): number {
        return token.length < 4 || /^\p{N}+$/u.test(token) ? 0 : 1;
    }

    // Motifs LIKE de présélection SQL, volontairement larges : le tri et le filtrage sont faits par getMatchScore
    public getLikePatterns(search: SearchQuery): LikePatterns {
        const longTokens = search.tokens.filter((token) => this.canMatchInsideWord(token));
        if (longTokens.length === 0) {
            // Uniquement des mots-clés courts ("x", "e.t.") : la recherche commence le titre ou un mot
            return {
                title: [],
                spacedTitle: [`${search.text}%`, `% ${search.text}%`],
                noSpaceTitle: [this.canMatchInsideWord(search.noSpace) ? `${search.noSpace}%` : search.noSpace]
            };
        }

        const titlePatterns = new Set<string>();
        for (const token of longTokens) {
            titlePatterns.add(`%${token}%`);
            if (this.getMaxTypos(token) > 0) {
                titlePatterns.add(`%${token.replace(/oe|ae/g, '_')}%`);    // "coeur" → "cœur" (LIKE ne décompose pas les ligatures)
                this.getTypoVariants(token).forEach((variant) => titlePatterns.add(`%${variant}%`));
            }
        }
        return {
            title: [...titlePatterns],
            spacedTitle: [],
            noSpaceTitle: [`%${search.noSpace}%`]   // "walle" → "WALL·E", "rezero" → "Re:ZERO"
        };
    }

    // Variantes à une faute de frappe près, première lettre conservée : "batmn" → "batm_n"
    public getTypoVariants(token: string): string[] {
        const chars = Array.from(token);
        const variants = new Set<string>();
        for (let i = 1; i < chars.length; i++) {
            variants.add([...chars.slice(0, i), ...chars.slice(i + 1)].join(''));                              // Lettre en trop
            variants.add([...chars.slice(0, i), '_', ...chars.slice(i)].join(''));                             // Lettre manquante
            if (i < chars.length - 1) {
                variants.add([...chars.slice(0, i), '_', ...chars.slice(i + 1)].join(''));                     // Lettre erronée
                variants.add([...chars.slice(0, i), chars[i + 1], chars[i], ...chars.slice(i + 2)].join(''));  // Lettres inversées
            }
        }
        variants.delete(token);
        return [...variants];
    }

    // Pertinence d'un titre pour la recherche, à comparer avec compareMatchScore
    public getMatchScore(search: SearchQuery, title: string, isAlternativeTitle: boolean = false): MatchScore {
        const text = this.normalizedText(title);
        const noSpace = text.replace(/ /g, '');
        const score = this.getTokensScore(search, text, isAlternativeTitle);

        if (text === search.text || noSpace === search.noSpace) {
            return { ...score, matchType: MatchType.EXACT, coverage: 1, typos: 0 };
        }
        if (text.startsWith(search.text) || (this.canMatchInsideWord(search.noSpace) && noSpace.startsWith(search.noSpace))) {
            return { ...score, matchType: MatchType.PREFIX, coverage: 1, typos: 0 };
        }
        if (` ${text}`.includes(` ${search.text}`)) {
            return { ...score, matchType: MatchType.WORD_PHRASE, coverage: 1, typos: 0 };
        }
        return score;
    }

    // Négatif si a est plus pertinent que b
    public compareMatchScore(a: MatchScore, b: MatchScore): number {
        return (b.matchType - a.matchType)
            || (b.coverage - a.coverage)
            || (a.typos - b.typos)
            || (a.distance - b.distance)
            || (Number(a.isAlternativeTitle) - Number(b.isAlternativeTitle))
            || (a.titleLength - b.titleLength);
    }

    // Ne garde que les titres avec tous les mots exacts s'il y en a, sinon ceux avec des fautes de frappe ou des mots contenus,
    // sinon ceux qui contiennent la plus grande partie de la recherche ("toy story 5" → Toy Story 1 à 4)
    public isRelevant(score: MatchScore, bestScore: MatchScore): boolean {
        if (bestScore.matchType >= MatchType.ALL_WORDS) {
            return score.matchType >= MatchType.ALL_WORDS;
        }
        if (bestScore.matchType > MatchType.NONE) {
            return score.matchType > MatchType.NONE;
        }
        return bestScore.coverage >= this.MIN_PARTIAL_COVERAGE && score.coverage === bestScore.coverage;
    }

    // Correspondance mot-clé par mot-clé, dans n'importe quel ordre, chacun sur un mot différent du titre
    private getTokensScore(search: SearchQuery, text: string, isAlternativeTitle: boolean): MatchScore {
        const score: MatchScore = { matchType: MatchType.ALL_WORDS, coverage: 0, typos: 0, distance: 0, isAlternativeTitle, titleLength: text.length };

        // Des lettres isolées ("e t" pour E.T.) ne comptent que si elles se suivent comme dans la recherche
        if (search.tokens.length > 1 && !search.tokens.some((token) => this.canMatchInsideWord(token))) {
            return { ...score, matchType: MatchType.NONE };
        }

        const words = text.split(' ');
        const noSpace = words.join('');
        const wordStarts: number[] = [];
        let position = 0;
        for (const word of words) {
            wordStarts.push(position);
            position += word.length;
        }
        const usedWords = new Set<number>();

        let matchedLength = 0;
        // Les mots-clés les plus longs choisissent leur mot en premier : "la land" ne compte pas deux fois "lands"
        for (const token of [...search.tokens].sort((a, b) => b.length - a.length)) {
            const wordMatch = this.getWordStartMatch(token, words, noSpace, wordStarts, usedWords);
            const fuzzy = wordMatch ? null : this.getFuzzyMatch(token, words, usedWords);
            if (wordMatch) {
                wordMatch.words.forEach((index) => usedWords.add(index));
                score.distance += wordMatch.distance;
            } else if (fuzzy) {
                usedWords.add(fuzzy.word);
                score.matchType = Math.min(score.matchType, MatchType.FUZZY);
                score.typos += fuzzy.typos;
                score.distance += fuzzy.distance;
            } else if (this.canMatchInsideWord(token) && words.some((word) => word.includes(token))) {
                score.matchType = Math.min(score.matchType, MatchType.CONTAINS);
            } else {
                score.matchType = MatchType.NONE;
                continue;
            }
            matchedLength += token.length;
        }
        score.coverage = matchedLength / search.tokens.reduce((total, token) => total + token.length, 0);
        return score;
    }

    // Mots du titre commencés par le mot-clé, éventuellement collés ("spiderman" → "spider man"), et lettres restantes du dernier
    private getWordStartMatch(token: string, words: string[], noSpace: string, wordStarts: number[], usedWords: Set<number>): { words: number[], distance: number } | null {
        let best: { words: number[], distance: number } | null = null;
        for (let i = 0; i < words.length; i++) {
            if (!noSpace.startsWith(token, wordStarts[i])) {
                continue;
            }
            const end = wordStarts[i] + token.length;
            let last = i;
            while (last + 1 < words.length && wordStarts[last + 1] < end) {
                last++;
            }
            const indexes = Array.from({ length: last - i + 1 }, (_, k) => i + k);
            const distance = wordStarts[last] + words[last].length - end;
            // Mots collés : chaque mot apporte au moins 2 lettres ("dune" ≠ "d'une", "die" ≠ "di Electro")
            const isolatedLetter = last > i && (words.slice(i, last).some((word) => word.length < 2) || end - wordStarts[last] < 2);
            if (indexes.some((index) => usedWords.has(index))
                || (token.length === 1 && distance > 0)     // Une lettre seule doit être un mot entier ("e" ≠ "el")
                || isolatedLetter) {
                continue;
            }
            if (!best || distance < best.distance) {
                best = { words: indexes, distance };
            }
        }
        return best;
    }

    // Mot du titre le plus proche à quelques fautes de frappe près, même première lettre : "hary" → "harry", "intesr" → "interstellar"
    private getFuzzyMatch(token: string, words: string[], usedWords: Set<number>): { word: number, typos: number, distance: number } | null {
        const maxTypos = this.getMaxTypos(token);
        let best: { word: number, typos: number, distance: number } | null = null;
        if (maxTypos === 0) {
            return best;
        }
        for (let i = 0; i < words.length; i++) {
            if (usedWords.has(i) || words[i][0] !== token[0]) {
                continue;
            }
            const [prefixDistance, wordDistance] = this.getEditDistances(token, words[i]);
            // Début de mot accepté à partir de 6 lettres, sinon le mot entier ("films" ≠ "filosofal")
            const typos = token.length >= this.MIN_PREFIX_TYPO_LENGTH ? prefixDistance : wordDistance;
            if (typos <= maxTypos && (!best || typos < best.typos || (typos === best.typos && wordDistance < best.distance))) {
                best = { word: i, typos, distance: wordDistance };
            }
        }
        return best;
    }

    // Distance d'édition (une inversion de deux lettres = une faute) avec le meilleur début du mot, puis avec le mot entier
    private getEditDistances(token: string, word: string): [number, number] {
        const a = Array.from(token);
        const b = Array.from(word);
        const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

        for (let i = 0; i <= a.length; i++) dp[i][0] = i;
        for (let j = 0; j <= b.length; j++) dp[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // suppression
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + cost // substitution
                );
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                    dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // inversion
                }
            }
        }

        return [Math.min(...dp[a.length]), dp[a.length][b.length]];
    }

}