import { Media } from "src/media/dto/media.interface"
import { SelectionType } from "./selection-type.enum"
import { MediaType } from "src/media/dto/media-type.enum"

export interface Selection {
    id: number,
    name: string,
    selectionType: SelectionType,
    mediaList: Media[],
    createFrom: MediaType
}