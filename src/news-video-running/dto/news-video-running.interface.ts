import { Media } from "src/media/dto/media.interface";

export interface NewsVideoRunning {
    id: number,
    mediaLibraryId: string,
    srcBackground: string | null,
    startShow: string | null,
    endShow: string | null,
    path?: string,
    media: Media,
}