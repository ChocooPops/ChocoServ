import { SelectionType } from "./selection-type.enum";

export interface EditSelection {
    id: number,
    name: string,
    selectionType: SelectionType,
    mediaList: number[]
}