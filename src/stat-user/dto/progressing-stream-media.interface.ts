import { StatState } from "./stat-state.enum"

export interface ProgressingStreamMedia {
    mediaId: number,
    watchProgress: number,
    stateProgress: StatState
}