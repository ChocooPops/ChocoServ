import { CategorySimple } from "src/category/dto/categorySimple.interface"
import { TranslationTitle } from "./translation-title.interface"
import { MediaType } from "./media-type.enum"
import { Poster } from "./poster.interface"

export interface Media {
    id: number,
    title: string,
    jellyfinId: string,
    otherTitles: TranslationTitle[],
    categories: CategorySimple[],
    keyWord: string[],
    description: string,
    directors: string[],
    actors: string[],
    date: Date,
    startShow: string | null,
    endShow: string | null,
    srcPoster: Poster
    srcLogo: string | null,
    srcBackgroundImage: string | null,
    mediaType?: MediaType,
    path?: string
}