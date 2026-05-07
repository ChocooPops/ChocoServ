import { Media } from "src/media/dto/media.interface";
import { StatState } from "src/stat-user/dto/stat-state.enum";

export interface Movie extends Media {
    resolution: string,
    duration: number,
    watchProgress: number,
    stateProgress: StatState
}
