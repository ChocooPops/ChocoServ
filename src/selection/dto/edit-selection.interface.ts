import { SelectionType } from "./selection-type.enum";

export interface EditSelection {
    id: number,
    name: string,
    isOrderRandom: boolean,
    selectionType: SelectionType,
    mediaList: number[]
}