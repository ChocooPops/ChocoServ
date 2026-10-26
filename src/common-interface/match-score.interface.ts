import { MatchType } from "./match-type.enum";

export interface MatchScore {
    matchType: MatchType,
    coverage: number,       // Part des mots-clés trouvés (en nombre de lettres)
    typos: number,          // Fautes de frappe corrigées
    distance: number,       // Lettres restantes dans les mots trouvés : "bat" → "Batman" = 3
    isAlternativeTitle: boolean,    // Trouvé dans une traduction plutôt que dans le titre affiché
    titleLength: number
}
