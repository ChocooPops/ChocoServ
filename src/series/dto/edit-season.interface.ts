import { EditEpisode } from "./edit-episode.interface";

export interface EditSeason {
    id: number,
    seriesId: number,
    jellyfinId: string | undefined,
    name: string | undefined,
    seasonNumber: number,
    srcPoster: string | ArrayBuffer | undefined | null,
    episodes: EditEpisode[]
}