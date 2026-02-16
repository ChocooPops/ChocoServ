import { CategoryStats } from "./category-stats.interface";

export interface UserCategoryPreferences {
  userId: number;
  totalWatched: number;
  categories: CategoryStats[];
}