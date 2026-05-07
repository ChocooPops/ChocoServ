import { MediaType } from "src/media/dto/media-type.enum";

export interface MediaLibrary {
    id: string,
    libraryId: string,
    titleFormated: string,
    year: string,
    path: string,
    type: MediaType,
    tmdbId: number,
    duration: number,
    frames: number,
    bytes: number,
    width: number,
    height: number,
    resolution: number
}