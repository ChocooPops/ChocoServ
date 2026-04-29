import { Job } from "./job.enum"

export interface MediaCredit {
    id: number,
    tmdbId: number,
    fullName: string,
    originalFullName: string,
    character: string | null,
    srcPoster: string | null,
    job: Job,
    episodeCount?: number,
    order: number
}