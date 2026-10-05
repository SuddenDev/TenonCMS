import { type Field } from "../../schema/index.ts";

/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type PopulatePlan = false | number | { [key: string]: true | PopulatePlan };

/**
 * Reads the populate plan from read options: `populate: false`, a populate object, or `depth` hops.
 * @returns The plan. `depth` is the default when the options set none.
 */
export function toPopulatePlan(
  options: { populate?: boolean | object; depth?: number },
  depth: number,
): PopulatePlan {
  if (options.populate === false) return false;
  if (typeof options.populate === "object") return options.populate as PopulatePlan;
  return options.depth ?? depth;
}

/**
 * A group passes the plan through, one hop at least. A join resolves only when a populate object names it.
 * The type-level twins are `Sub` and `Next` in `inference.ts`.
 *
 * @returns Whether the value of `key` resolves at all (`on`), and the plan its value continues with (`child`).
 */
export function step(
  plan: PopulatePlan | true,
  key: string,
  field: Field,
): { on: boolean; child: PopulatePlan | true } {
  const sub: PopulatePlan | true = typeof plan === "object" ? (plan[key] ?? false) : plan;

  if (field.type === "group") return { on: Boolean(sub), child: sub === true ? 1 : sub };
  if (field.type === "join" && typeof plan !== "object") return { on: false, child: false };

  if (sub === true) return { on: true, child: false };
  if (typeof sub === "number") return { on: sub > 0, child: sub - 1 };
  return { on: Boolean(sub), child: sub };
}
