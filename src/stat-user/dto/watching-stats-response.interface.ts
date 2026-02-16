import { PeriodType } from "./period.type";
import { ContentType } from "./content.type";
import { DataPoint } from "./data-point.interface";

export interface WatchingStatsResponse {
  userId: number;
  startDate: string;
  periodType: PeriodType;
  contentType: ContentType;
  data: DataPoint[];
}