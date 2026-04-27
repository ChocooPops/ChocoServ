import { CategorySimple } from "src/category/dto/categorySimple.interface";
import { EditPoster } from "./edit-poster.interface";
import { TranslationTitle } from "./translation-title.interface";
import { Credit } from "src/credit/dto/credit.interface";

export interface EditMedia {
    id: number;
    title: string,
    jellyfinId: string,
    otherTitles: TranslationTitle[],
    credits: Credit[],
    categories: CategorySimple[],
    keyWords: string[],
    date: Date,
    startShow: string,
    endShow: string,
    description: string | undefined,
    posters: EditPoster[],
    horizontalPoster: EditPoster[],
    horizontalPosterSameAsBackground: boolean,
    logo: string | ArrayBuffer | undefined | null,
    backgroundImage: string | ArrayBuffer | undefined | null;
}