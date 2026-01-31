import { Media } from "src/media/dto/media.interface";

export interface News {
    id: number,
    srcBackground: string | null,
    orientation: number,
    media: Media
}