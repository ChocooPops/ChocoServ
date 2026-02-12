export interface StatUser {
    id: number,
    userId:number,
    movieId?:number,
    episodeId?:number,
    state: StatUser,
    watchProgress: number
}