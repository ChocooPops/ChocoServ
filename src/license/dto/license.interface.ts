import { Selection } from "src/selection/dto/selection.interface";
import { Media } from "src/media/dto/media.interface";

export interface License {
    id: number,
    name: string,
    order: number,
    position: boolean,
    srcIcon: string | null,
    srcLogo: string | null,
    srcBackground: string | null,
    mediaList: Media[],
    selectionList: Selection[]
}