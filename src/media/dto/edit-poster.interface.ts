import { SelectionType } from "src/selection/dto/selection-type.enum";

export interface EditPoster {
    id: number;
    srcPoster: string | ArrayBuffer | undefined | null;
    typePoster: {
        id: number,
        type_id: SelectionType
    }[];
}