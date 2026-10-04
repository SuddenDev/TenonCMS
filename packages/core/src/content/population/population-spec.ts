import { type Field } from "../../schema/index.ts";

/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type Spec = false | number | { [key: string]: true | Spec };
/** The populate spec of read options: `populate: false`, a populate object, or `depth` hops (default `depth`). */
export function toSpec(
  options: { populate?: boolean | object; depth?: number },
  depth: number,
): Spec {
  return options.populate === false
    ? false
    : typeof options.populate === "object"
      ? (options.populate as Spec)
      : (options.depth ?? depth);
}

/**
 * What `key` gets under `spec`: whether its value resolves at all (`on`), and the spec its value continues with (`child`).
 * A group passes the spec through, one hop at least. A join resolves only when a populate object names it.
 * The type-level twins are `Sub` and `Next` in `types.ts`.
 */
export function step(
  spec: Spec | true,
  key: string,
  field: Field,
): { on: boolean; child: Spec | true } {
  const sub: Spec | true = typeof spec === "object" ? (spec[key] ?? false) : spec;
  if (field.type === "group") return { on: Boolean(sub), child: sub === true ? 1 : sub };
  if (field.type === "join" && typeof spec !== "object") return { on: false, child: false };
  if (sub === true) return { on: true, child: false };
  if (typeof sub === "number") return { on: sub > 0, child: sub - 1 };
  return { on: Boolean(sub), child: sub };
}
