/** Recommended lengths in characters, as Payload's SEO plugin uses them. */
export const SEO_LENGTHS = {
  title: { min: 50, max: 60 },
  description: { min: 100, max: 150 },
} as const;

type Limits = { min: number; max: number };

export type LengthHint = {
  status: "missing" | "short" | "almost" | "good" | "long";
  /** Fill of the bar, 0 to 1. Below `min` it is the share of `min`, within the range the share of the range. */
  progress: number;
  /** What `n` counts: characters still missing, still free, or over `max`. */
  rest: "toGo" | "leftOver" | "tooMany";
  n: number;
};

/** Rates the length of a text against recommended limits. */
export function lengthHint(text: string, { min, max }: Limits): LengthHint {
  const length = text.length;
  if (length > max) return { status: "long", progress: 1, rest: "tooMany", n: length - max };
  if (length >= min)
    return {
      status: "good",
      progress: (length - min) / (max - min),
      rest: "leftOver",
      n: max - length,
    };

  const share = length / min;
  const status = length === 0 ? "missing" : share > 0.9 ? "almost" : "short";
  return { status, progress: share, rest: "toGo", n: min - length };
}

const fits = (text: string | undefined, limits: Limits) =>
  !!text && lengthHint(text, limits).status === "good";

/** How many of the three checks pass: title length, description length and an image. */
export function passingChecks(meta: { title?: string; description?: string; image: boolean }) {
  return [
    fits(meta.title, SEO_LENGTHS.title),
    fits(meta.description, SEO_LENGTHS.description),
    meta.image,
  ].filter(Boolean).length;
}
