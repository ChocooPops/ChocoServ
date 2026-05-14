import { MediaType } from "src/media/dto/media-type.enum";
import { StateLibrary } from "./state-library.enum";

export interface MediaLibrary {
    id: string,
    state: StateLibrary,
    libraryId: string,
    parentId: string,
    seasonNumber: number,
    episodeNumber: number,
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
    resolution: number,
    createdDate: Date,
    updatedAt: Date
}