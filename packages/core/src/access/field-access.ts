import type { Core, Inner } from "../cms/runtime/types.ts";
import { type Name, target } from "../content/targets.ts";
import { hookArgs } from "../content/lifecycle/hook-args.ts";
import { isObject } from "../schema/condition.ts";
import { itemFields } from "../schema/traversal/item-fields.ts";
import { eachField } from "../schema/traversal/each-field.ts";
import type { Field, Fields } from "../schema/index.ts";
import { PRIVATE, check } from "./rule.ts";
import type { FieldAccess, FieldAccessArgs } from "./types.ts";

type Doc = Record<string, any>;

/** What a walk over one document shares: the scope, the hook arguments and the document. */
type StripPass = { s: Inner; base: object; doc: Doc };

/** What a walk over one input shares, plus the operation and the stored document. */
type DropPass = { s: Inner; base: object; op: "create" | "update"; data: Doc; source?: Doc };

/**
 * Whether the caller of `s` MAY `op` field `f`. A `private` field reads like `read: <signed in>`.
 * @returns `true` when allowed.
 */
export async function fieldAllowed(
  s: Inner,
  f: Field,
  op: keyof FieldAccess,
  args: object & FieldAccessArgs,
) {
  if (s.overrideAccess) return true;
  const rule = f.access?.[op] ?? (op === "read" && f.private ? PRIVATE : undefined);
  return rule === undefined || (await check(s, rule, args)) === true;
}

/**
 * Removes what the caller of `s` cannot read from `docs`, in place: read-denied fields, inside groups and items too.
 * A caller without a user also loses `createdBy`, `updatedBy` and the fields of an item of an unknown block. Populated
 * documents are not walked: their own read strips them.
 */
export async function stripDenied(core: Core, s: Inner, name: Name, docs: Doc[]) {
  if (s.overrideAccess) return;
  const base = hookArgs(s, name, {});
  const { fields } = target(core, name);
  // `eachField()` skips joins. A join is always a top-level key.
  const joins = Object.entries(fields).filter(([, f]) => f.type === "join");

  for (const doc of docs) {
    if (!s.user) {
      delete doc.createdBy;
      delete doc.updatedBy;
    }

    const visit = stripVisit({ s, base, doc });
    await eachField(fields, doc, visit);
    for (const [key, f] of joins) await visit(key, f, doc, key);
  }
}

/** A visit of `eachField()` that deletes a read-denied key of `holder`, so the walk skips what it held. */
function stripVisit({ s, base, doc }: StripPass) {
  return async (key: string, f: Field, holder: Doc, path: string) => {
    const value = holder[key];
    if (value === undefined) return false;
    if (!(await fieldAllowed(s, f, "read", { ...base, doc, siblingData: holder, path }))) {
      delete holder[key];
      return false;
    }

    // The fields of an unknown block are unknown, so a reader without a user MUST NOT see any of them.
    if (!s.user && f.type === "blocks" && Array.isArray(value))
      for (const [i, item] of value.entries())
        if (isObject(item) && !itemFields(f, item))
          value[i] = { id: item.id, blockType: item.blockType };
  };
}

/**
 * Drops input values of fields the caller of `s` MAY NOT `op`, so the stored values stay: a top-level key goes, a
 * field inside a group or an item gets the stored value back (items match by `id`). A group or an item replaces its
 * stored value as a whole, so a field inside it that the caller cannot read, and the input leaves out, keeps its
 * stored value too.
 * @returns A copy of `input` without the denied values.
 */
export async function dropDenied(
  core: Core,
  s: Inner,
  name: Name,
  op: "create" | "update",
  input: unknown,
  source?: Doc,
) {
  if (s.overrideAccess || !isObject(input)) return input;

  const data = structuredClone(input);
  const pass: DropPass = { s, base: hookArgs(s, name, {}), op, data, source };
  await drop(pass, target(core, name).fields, data, source, "");
  return data;
}

/** Restores the stored value of each denied key of `holder`, or deletes the key when nothing is stored. */
async function drop(
  pass: DropPass,
  fields: Fields,
  holder: Doc,
  stored: Doc | undefined,
  prefix: string,
) {
  const { s, base, op, data, source } = pass;

  for (const [key, f] of Object.entries(fields)) {
    const value = holder[key];
    const old = stored?.[key];
    const path = prefix + key;
    const args = { ...base, doc: source, data, siblingData: holder, path };
    const kept = stored !== undefined && Object.hasOwn(stored, key);

    // A key the input leaves out keeps its stored value inside a group or item, unless the caller may read it.
    if (!Object.hasOwn(holder, key)) {
      if (prefix && kept && !(await fieldAllowed(s, f, "read", args))) holder[key] = old;
      continue;
    }

    if (!(await fieldAllowed(s, f, op, args))) {
      if (kept) holder[key] = old;
      else delete holder[key];
    } else if (f.type === "group" && isObject(value)) {
      await drop(pass, f.fields, value, isObject(old) ? old : undefined, `${path}.`);
    } else if ((f.type === "array" || f.type === "blocks") && Array.isArray(value)) {
      await dropItems(pass, f, value, old, path);
    }
  }
}

/** Drops denied values in each item, against the stored item with the same `id`. */
async function dropItems(pass: DropPass, f: Field, items: unknown[], old: unknown, path: string) {
  for (const [i, item] of items.entries()) {
    const inner = isObject(item) && itemFields(f, item);
    if (!inner) continue;

    const match = Array.isArray(old) ? old.find((o) => o?.id === item.id) : undefined;
    await drop(pass, inner, item, isObject(match) ? match : undefined, `${path}.${i}.`);
  }
}
