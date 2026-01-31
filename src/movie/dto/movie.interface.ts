import { Media } from "src/media/dto/media.interface";

export interface Movie extends Media {
    quality: string,
    time: number,
}
