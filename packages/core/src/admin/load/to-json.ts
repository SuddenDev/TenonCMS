import type { Json } from "../index.d.ts";

const isPlain = (v: object) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Copies a loader result and checks that it is JSON: `null`, booleans, strings, finite numbers, arrays and plain
 * objects. Object properties that are `undefined` count as absent and are dropped.
 * @param where Names the value in the error message, e.g. `result`.
 * @returns The copy. Its objects are safe to extend: an own `__proto__` key stays plain data.
 * @throws If the value is not JSON. The message names the path of the first bad value.
 */
export function toJson(value: unknown, where: string): Json {
  return walk(value, where, []);
}

function walk(value: unknown, where: string, parents: object[]): Json {
  const fail = (what: string): never => {
    throw new Error(`${where} is not JSON: ${what}`);
  };
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fail("not a finite number");
  if (typeof value !== "object") return fail(`${typeof value} is not allowed`);
  if (parents.includes(value)) return fail("cycle");
  const next = [...parents, value];

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return fail("array subclass");
    return Array.from({ length: value.length }, (_, i) =>
      i in value ? walk(value[i], `${where}[${i}]`, next) : fail(`hole at [${i}]`),
    );
  }
  if (!isPlain(value)) return fail("only plain objects are allowed");
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, walk(v, `${where}.${k}`, next)]),
  );
}
