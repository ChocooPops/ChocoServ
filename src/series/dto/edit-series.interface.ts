import { EditMedia } from "src/media/dto/edit-media.interface";
import { EditSeason } from "./edit-season.interface";

export interface EditSeries extends EditMedia {
    seasons: EditSeason[]
}