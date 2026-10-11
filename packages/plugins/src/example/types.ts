export type Quote = { id: string; text?: string; author?: string; rating?: string };

/** What the `quote-stats` page's `load` returns. */
export type Stats = {
  count: number;
  changes: number;
  /** Number of quotes per rating, from 1 to 5. */
  ratings: number[];
  quotes: Quote[];
};
