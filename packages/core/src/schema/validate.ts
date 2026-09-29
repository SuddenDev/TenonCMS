import { z } from "zod";
import { type Condition, isObject, matchCondition } from "./condition.ts";
import { ValidationError } from "../errors.ts";
import { fieldSchema } from "./fields/index.ts";
import { fieldAt, isRef, relationPaths, targetOf } from "./walk.ts";
import type { Fields, Schema } from "./index.ts";

// Startup checks.

const uniqueTypes = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "slug",
  "relation",
  "image",
  "file",
];

function fail(message: string): never {
  throw new Error(`integral-cms: ${message}`);
}

// Collections first, then globals.
const owners = (schema: Schema) => [
  ...Object.entries(schema.collections ?? {}).map(([name, c]) => ({
    name,
    fields: c.fields,
    global: false,
  })),
  ...Object.entries(schema.globals ?? {}).map(([name, g]) => ({
    name,
    fields: g.fields,
    global: true,
  })),
];

/**
 * Throws when the schema cannot work: a relation or join that does not fit, a condition on an unknown field,
 * `unique` where it cannot apply, an invalid `pattern`, or a populate depth above the limit.
 */
export function checkSchema(schema: Schema, populate: { depth: number; maxDepth: number }) {
  const collections = schema.collections ?? {};
  if (populate.depth > populate.maxDepth)
    fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`);
  for (const { name, fields, global } of owners(schema)) {
    for (const { path, field } of relationPaths(fields)) {
      const at = `${field.type} "${name}.${path.join(".")}"`;
      const to = targetOf(field);
      if (field.type === "relation" && to === "media")
        fail(`${at} cannot point to "media"; use an image or file field`);
      if (field.type !== "relation" && !Object.hasOwn(collections, "media"))
        fail(`${at} needs the \`media\` option`);
      if (!Object.hasOwn(collections, to)) fail(`${at} targets unknown collection "${to}"`);
      if (field.type !== "relation" && (field.onDelete as string) === "cascade")
        fail(`${at} cannot use onDelete: 'cascade'`);
      if (field.required && field.onDelete === "set-null")
        fail(`${at} is required and cannot use onDelete: 'set-null'`);
      if (global && field.onDelete === "cascade")
        fail(`${at} is in a global and cannot use onDelete: 'cascade'`);
    }
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === "group" && hasJoin(f.fields)) fail(`join inside group "${name}.${key}"`);
      if (f.type !== "join") continue;
      if (global) fail(`join "${name}.${key}" in a global`);
      const source = Object.hasOwn(collections, f.collection)
        ? collections[f.collection].fields
        : undefined;
      const target = source && relationPaths(source).find((r) => r.path.join(".") === f.on);
      if (!target || targetOf(target.field) !== name)
        fail(
          `join "${name}.${key}" needs "${f.on}" to be a relation to "${name}" in "${f.collection}"`,
        );
    }
    checkFields(fields, fields, name, !global);
    // Compiles every `pattern`, so an invalid one throws here.
    dataSchema(fields);
  }
}

function hasJoin(fields: Fields): boolean {
  return Object.values(fields).some(
    (f) => f.type === "join" || (f.type === "group" && hasJoin(f.fields)),
  );
}

// `top`: fields at the top level of a collection, the only place `unique` works.
function checkFields(fields: Fields, root: Fields, where: string, top: boolean) {
  for (const [key, f] of Object.entries(fields)) {
    const at = `${where}.${key}`;
    if (
      "unique" in f &&
      f.unique &&
      (!top || !uniqueTypes.includes(f.type) || (isRef(f) && f.many))
    )
      fail(`"${at}" cannot be unique`);
    for (const path of conditionPaths(f.condition ?? {})) {
      const target = path.startsWith("/") ? fieldAt(root, path.slice(1)) : fieldAt(fields, path);
      if (!target) fail(`condition on "${at}" names unknown field "${path}"`);
    }
    if (f.type === "group") checkFields(f.fields, root, at, false);
  }
}

function conditionPaths(condition: Condition): string[] {
  return Object.entries(condition).flatMap(([key, c]) =>
    key === "$every" || key === "$some" ? (c as Condition[]).flatMap(conditionPaths) : [key],
  );
}

// Validation of one write.

/**
 * Builds the validator for `data`. Unknown keys are stripped.
 * A field whose `condition` is false keeps its type check, but `required` and the built-in checks are skipped.
 */
export function dataSchema(
  fields: Fields,
  data: unknown = {},
  root = data,
  active = true,
): z.ZodObject {
  const siblings = isObject(data) ? data : {};
  return z.object(
    Object.fromEntries(
      Object.entries(fields).flatMap(([name, field]) => {
        if (field.type === "join") return [];
        const on = active && (!field.condition || matchCondition(field.condition, root, siblings));
        const s =
          field.type === "group"
            ? dataSchema(field.fields, siblings[name], root, on)
            : fieldSchema(field, on);
        return [[name, on && field.required ? s : s.optional().nullable()]];
      }),
    ),
  );
}

/** Validates `data` against `fields`. Throws a `ValidationError` keyed by field path. Built per write, because conditions depend on the data. */
export function parseData(fields: Fields, data: unknown) {
  const result = dataSchema(fields, data).safeParse(data);
  if (!result.success)
    throw new ValidationError(
      Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message])),
    );
  return result.data as Record<string, unknown>;
}
