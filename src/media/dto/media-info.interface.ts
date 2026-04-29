import { MediaCredit } from "src/credit/dto/media-credit.interface"
import { CategorySimple } from "src/category/dto/categorySimple.interface"

export interface MediaInfo {
    id: number,
    casts: MediaCredit[],
    crews: MediaCredit[],
    categories: CategorySimple[],
    keyWords: string[]
}