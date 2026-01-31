import { Media } from "src/media/dto/media.interface"
import { SelectionType } from "./selection-type.enum"

export interface Selection {
    id: number,
    name: string,
    selectionType: SelectionType,
    mediaList: Media[]
}