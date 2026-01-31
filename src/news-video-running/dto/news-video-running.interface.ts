import { Media } from "src/media/dto/media.interface";

export interface NewsVideoRunning {
    id: number,
    jellyfinId: string,
    srcBackground: string | null,
    startShow: string | null,
    endShow: string | null,
    media: Media,
}