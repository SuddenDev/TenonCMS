import { isObject } from "../condition.ts";

/** Applies `fn` to a document, or to each document of an array. Other values pass through. */
export function mapValue(value: unknown, fn: (doc: Record<string, any>) => unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => mapValue(v, fn));
  return isObject(value) ? fn(value) : value;
}
