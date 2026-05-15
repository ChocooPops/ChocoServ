import { StatState } from "src/stat-user/dto/stat-state.enum"

export interface Episode {
    id: number,
    seriesId: number,
    seasonId: number,
    mediaLibraryId: string
    name: string,
    episodeNumber: number
    description: string,
    date: Date,
    duration: number,
    resolution: string,
    srcPoster: string,
    watchProgress: number,
    stateProgress: StatState,

    path?: string,
    frames?: number,
    bytes?: number,
    width?: number,
    height?:number
}