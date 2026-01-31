import { MediaType } from "src/media/dto/media-type.enum";

export interface Link {
    source: number,
    target: number,
    targetType?: MediaType
}