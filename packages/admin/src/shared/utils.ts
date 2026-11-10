import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536e6],
  ["month", 2592e6],
  ["day", 864e5],
  ["hour", 36e5],
  ["minute", 6e4],
];

const formats = new Map<string, Intl.RelativeTimeFormat>();

/** "3 minutes ago", "yesterday", "now": a date relative to now in `locale`, for list rows and status bars. */
export function ago(date: string | number | Date, locale: string) {
  const diff = new Date(date).getTime() - Date.now();
  let rtf = formats.get(locale);
  if (!rtf) formats.set(locale, (rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })));
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, "second");
}

/** "Jan 5, 2027, 9:00 AM": a date and time in `locale`, in `timeZone`. */
export function formatDateTime(date: string | number | Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(date));
}
