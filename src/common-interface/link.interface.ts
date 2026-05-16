import { MediaType } from "src/media/dto/media-type.enum";

export interface Link {
    source: number | string,
    target: number | string,
    targetType?: MediaType
}