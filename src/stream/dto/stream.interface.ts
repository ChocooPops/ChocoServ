import { Media } from "src/media/dto/media.interface";

export interface StreamInfo {
    title: string,
    media: Media,
    idx: number,
    audios: { name: string, index: number }[],
    subtitles: { name: string, index: number }[]
}