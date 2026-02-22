import { StatState } from "src/stat-user/dto/stat-state.enum"

export interface Episode {
    id: number,
    seasonId: number,
    jellyfinId: string
    name: string,
    episodeNumber: number
    description: string,
    date: Date,
    time: number,
    quality: string,
    srcPoster: string,
    path?: string,
    watchProgress: number,
    stateProgress: StatState
}