// Motifs LIKE selon la forme du titre : brut, ponctuation remplacée par des espaces ("E T"), sans espaces ni ponctuation ("WALLE")
export interface LikePatterns {
    title: string[],
    spacedTitle: string[],
    noSpaceTitle: string[]
}
