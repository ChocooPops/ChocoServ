// Qualité de la correspondance entre un titre et la recherche, de la plus faible à la plus forte
export enum MatchType {
    NONE,           // Au moins un mot-clé est absent du titre
    CONTAINS,       // Un mot-clé est au milieu d'un mot : "atman" → "Batman"
    FUZZY,          // Un mot-clé contient une faute de frappe : "hary" → "Harry"
    ALL_WORDS,      // Chaque mot-clé commence un mot, dans n'importe quel ordre : "potter harry"
    WORD_PHRASE,    // La recherche commence un mot du titre : "potter" → "Harry Potter"
    PREFIX,         // Le titre commence par la recherche : "harry pot" → "Harry Potter"
    EXACT           // Le titre est la recherche : "walle" → "WALL·E"
}
