import { Media } from "src/media/dto/media.interface"
import { Movie } from "src/movie/dto/movie.interface"
import { Series } from "src/series/dto/series.interface"

export interface CategoryEntirely {
    id: number,
    name: string,
    nameSelection: string,
    movies: Movie[],
    series: Series[],
    medias?: Media[]
}