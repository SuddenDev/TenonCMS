import type { Fields } from "@/shared/api";

// Deep equality of JSON values. Object key order does not matter, and `undefined` counts as `null`.
function same(a: unknown, b: unknown): boolean {
  if ((a ?? null) === (b ?? null)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => same((a as any)[k], (b as any)[k]));
}

/** The top-level fields whose values differ between two versions, in field order. Joins are not stored, so they never count. */
export const changedKeys = (
  fields: Fields,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) =>
  Object.entries(fields)
    .filter(([key, f]) => f.type !== "join" && !same(before[key], after[key]))
    .map(([key]) => key);

export type TimeGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "older";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The calendar group of `date`, in local time. Weeks start on Monday. A group that fits earlier wins: yesterday before this week. */
export function timeGroup(date: Date, now = new Date()): TimeGroup {
  const today = startOfDay(now);
  const day = startOfDay(date);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const months = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < ((today.getDay() + 6) % 7) + 1) return "thisWeek";
  if (months === 0) return "thisMonth";
  if (months === 1) return "lastMonth";
  return "older";
}

/** Splits a list sorted newest first into runs of the same `timeGroup()` of `updatedAt`. */
export function groupByTime<T extends { updatedAt: string }>(items: T[], now = new Date()) {
  const groups: { group: TimeGroup; items: T[] }[] = [];
  for (const item of items) {
    const group = timeGroup(new Date(item.updatedAt), now);
    if (groups.at(-1)?.group === group) groups.at(-1)!.items.push(item);
    else groups.push({ group, items: [item] });
  }
  return groups;
}
