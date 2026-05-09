export interface Category {
    id: number,
    tmdbId: number,
    translationKey: string,
    nameSelection: string,
    movies: number[],
    series: number[]
}