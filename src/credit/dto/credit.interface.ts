import { Job } from "./job.enum"

export interface Credit {
    id: number,
    tmdbId: number,
    fullName: string,
    originalFullName: string,
    character: string | null,
    srcPoster: string | null,
    job: Job,
    order: number
}