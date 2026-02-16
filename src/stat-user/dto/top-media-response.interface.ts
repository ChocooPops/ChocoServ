import { TopMedia } from "./top-media.interface";

export interface TopMediaResponse {
  userId: number;
  topMedia: TopMedia[];
}