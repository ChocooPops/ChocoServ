import { Credit } from "src/credit/dto/credit.interface"
import { CategorySimple } from "src/category/dto/categorySimple.interface"

export interface MediaInfo {
    id: number,
    casts: Credit[],
    crews: Credit[],
    categories: CategorySimple[],
    keyWords: string[]
}