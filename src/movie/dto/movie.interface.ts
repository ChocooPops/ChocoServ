import { Media } from "src/media/dto/media.interface";
import { StatState } from "src/stat-user/dto/stat-state.enum";

export interface Movie extends Media {
    quality: string,
    time: number,
    watchProgress: number,
    stateProgress: StatState
}
