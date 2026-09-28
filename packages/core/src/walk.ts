import { isObject, matchCondition } from "./condition.ts";
import { runHooks } from "./hooks/run.ts";
import { slugify } from "./helpers/slugify.ts";
import type {
  Collection,
  Field,
  FieldArgs,
  FieldHooks,
  Fields,
  HookArgs,
  RelationField,
  StoredField,
} from "./schema.ts";

type Visit = (
  key: string,
  field: StoredField,
  siblings: Record<string, any>,
  path: string,
) => unknown;

/**
 * Visits every stored field of `fields` in order, with the object that holds its value. After the visit, a group whose
 * value is an object is walked too, unless `visit` returned `false`. Joins are skipped.
 */
export async function eachField(
  fields: Fields,
  siblings: Record<string, any>,
  visit: Visit,
  prefix = "",
) {
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "join") continue;
    const path = prefix + key;
    if ((await visit(key, field, siblings, path)) === false) continue;
    if (field.type === "group" && isObject(siblings[key]))
      await eachField(field.fields, siblings[key], visit, `${path}.`);
  }
}

/** Every `relation` at the top level and inside groups, with its key path. */
export function relationPaths(
  fields: Fields,
  prefix: string[] = [],
): { path: string[]; field: RelationField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    f.type === "relation"
      ? [{ path: [...prefix, key], field: f }]
      : f.type === "group"
        ? relationPaths(f.fields, [...prefix, key])
        : [],
  );
}

/** The fields a value continues with: a group's own, or the target collection's for a relation or join. */
export function innerFields(collections: Record<string, Collection>, f: Field) {
  if (f.type === "group") return f.fields;
  if (f.type === "relation" || f.type === "join") return collections[f.collection].fields;
  return undefined;
}

/** Applies `fn` to a document, or to each document of an array. Other values pass through. */
export function mapValue(value: unknown, fn: (doc: Record<string, any>) => unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => mapValue(v, fn));
  return isObject(value) ? fn(value) : value;
}

/** The field at a dot path, through groups. */
export function fieldAt(fields: Fields, path: string): Field | undefined {
  const [key, ...rest] = path.split(".");
  const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (!f || !rest.length) return f;
  return f.type === "group" ? fieldAt(f.fields, rest.join(".")) : undefined;
}

/** Whether `where` accepts `key`. Groups, joins and `many` relations are not filterable. */
export function filterable(fields: Fields, key: string) {
  if (!Object.hasOwn(fields, key)) return false;
  const field = fields[key];
  return (
    field.type !== "group" && field.type !== "join" && !(field.type === "relation" && field.many)
  );
}

/** Fills each empty slug from its `from` field, in place. Runs before `beforeValidate`, like the admin's fill. */
export function fillSlugs(fields: Fields, data: Record<string, unknown>) {
  return eachField(fields, data, (key, f, siblings) => {
    if (f.type === "slug" && f.from && !siblings[key] && siblings[f.from])
      siblings[key] = slugify(String(siblings[f.from]));
  });
}

/** Fills `undefined` fields in place. Children of a group get defaults only when the group is present. */
export function applyDefaults(fields: Fields, data: Record<string, unknown>, args: HookArgs) {
  return eachField(fields, data, async (key, f, siblings) => {
    if (siblings[key] !== undefined || f.default === undefined) return;
    siblings[key] =
      typeof f.default === "function" ? await f.default(args) : structuredClone(f.default);
  });
}

/** The messages of field `validate` functions by path. Fields whose condition is false are skipped, with their children. */
export async function runValidate(
  fields: Fields,
  data: Record<string, any>,
  args: Omit<FieldArgs, "siblingData" | "path">,
) {
  const errors: Record<string, string> = {};
  await eachField(fields, data, async (key, f, siblings, path) => {
    if (f.condition && !matchCondition(f.condition, args.data, siblings)) return false;
    const result = await f.validate?.(siblings[key], { ...args, siblingData: siblings, path });
    if (typeof result === "string") errors[path] = result;
  });
  return errors;
}

/** Runs one stage of field hooks in place, depth-first. A group's own hooks run before its fields'. */
export function fieldHooks(
  stage: keyof FieldHooks<unknown>,
  fields: Fields,
  data: Record<string, any>,
  args: object,
) {
  return eachField(fields, data, async (key, f, siblings, path) => {
    if (!f.hooks?.[stage]) return;
    const value = await runHooks(f.hooks[stage], "value", siblings[key], {
      ...args,
      siblingData: siblings,
      path,
    });
    if (value !== undefined) siblings[key] = value;
  });
}
