export interface EditEpisode {
    id: number,
    seasonId: number,
    mediaLibraryId: string | undefined
    name: string | undefined,
    episodeNumber: number,
    description: string | undefined,
    date: Date | undefined,
    srcPoster: string | ArrayBuffer | undefined | null,
    path?: string
}