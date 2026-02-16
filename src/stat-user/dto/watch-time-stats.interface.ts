export interface WatchTimeStats {
  userId: number;
  movies: {
    totalHours: number;
    totalMinutes: number;
    totalSeconds: number;
    contentCount: number;
  };
  series: {
    totalHours: number;
    totalMinutes: number;
    totalSeconds: number;
    contentCount: number;
    episodeCount: number;
  };
  total: {
    totalHours: number;
    totalMinutes: number;
    totalSeconds: number;
    contentCount: number;
  };
}