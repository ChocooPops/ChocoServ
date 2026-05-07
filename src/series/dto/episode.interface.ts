import { StatState } from "src/stat-user/dto/stat-state.enum"

export interface Episode {
    id: number,
    seasonId: number,
    mediaLibraryId: string
    name: string,
    episodeNumber: number
    description: string,
    date: Date,
    duration: number,
    resolution: string,
    srcPoster: string,
    path?: string,
    watchProgress: number,
    stateProgress: StatState
}