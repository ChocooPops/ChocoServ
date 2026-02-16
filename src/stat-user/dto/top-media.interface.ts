export interface TopMedia {
  rank: number;
  mediaId: number;
  title: string;
  mediaType: 'MOVIE' | 'SERIES';
  description: string | null;
  date: string;
  quality: string | null;
  posterName: string | null;
  posterType: 'SPECIAL' | 'NORMAL' | 'LICENSE' | null;
  watchCount: number;
  totalProgress: number;
  avgProgress: number;
}