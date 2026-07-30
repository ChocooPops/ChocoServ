import { Injectable } from "@nestjs/common";

@Injectable()
export class SearchService {

    public normalizedKeyword(keyWord: string): string {
        return keyWord
            .normalize('NFD')                   // Décompose "é" → "e" + accent
            .replace(/[\u0300-\u036f]/g, '')    // Supprime les accents
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')        // Supprime les caractères spéciaux
            .replace(/\s+/g, ' ')               // Collapse les espaces multiples
            .trim();
    }

    public replaceWithUnderscores(str: string, iterations: number): string[] {
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


}