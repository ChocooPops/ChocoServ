import { Media } from "src/media/dto/media.interface";
import { Season } from "./season.interface";

export interface Series extends Media {
    seasons: Season[]
}