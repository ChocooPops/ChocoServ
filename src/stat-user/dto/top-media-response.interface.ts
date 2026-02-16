import { TopMedia } from "./top-media.interface";
import { MediaTypeFilter } from "./media-type-filter.interface";

export interface TopMediaResponse {
  userId: number;
  mediaType: MediaTypeFilter;
  topMedia: TopMedia[];
}