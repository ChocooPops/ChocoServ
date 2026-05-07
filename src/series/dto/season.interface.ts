import { Episode } from "./episode.interface";

export interface Season {
    id: number,
    seriesId: number,
    mediaLibraryId: string,
    name: string,
    seasonNumber: number,
    srcPoster: string,
    episodes: Episode[]
}