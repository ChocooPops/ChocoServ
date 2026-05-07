import { ISO_3166_1 } from "src/media/dto/iso-3166-1.enum";
import { MediaType } from "src/media/dto/media-type.enum";
import { StateLibrary } from "./state-library.enum";

export interface Library {
    id: string,
    path: string,
    mediaType: MediaType,
    lang: ISO_3166_1,
    state: StateLibrary
}