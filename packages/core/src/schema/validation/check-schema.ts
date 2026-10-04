import { type Condition } from "../condition.ts";
import { fieldAt } from "../traversal/field-at.ts";
import { isRef, targetOf } from "../traversal/reference-fields.ts";
import { relationPaths } from "../traversal/relation-paths.ts";
import { placeholders } from "../../preview/templates/placeholders.ts";
import { type Collection, type Fields, type Schema } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

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
    preview: c.preview,
    global: false,
  })),
  ...Object.entries(schema.globals ?? {}).map(([name, g]) => ({
    name,
    fields: g.fields,
    preview: g.preview,
    global: true,
  })),
];

/**
 * Throws when the schema cannot work: a relation or join that does not fit, a condition on an unknown field,
 * `unique` where it cannot apply, an invalid `pattern`, a `preview` placeholder on an unknown field, or a populate depth
 * above the limit.
 */
export function checkSchema(schema: Schema, populate: { depth: number; maxDepth: number }) {
  const collections = schema.collections ?? {};
  if (populate.depth > populate.maxDepth)
    fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`);
  for (const { name, fields, global, preview } of owners(schema)) {
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
    if (typeof preview === "string")
      for (const path of placeholders(preview))
        if (!previewField(collections, fields, path))
          fail(`preview of "${name}" names unknown field "${path}"`);
    // Compiles every `pattern`, so an invalid one throws here.
    dataSchema(fields);
  }
}

// A stored field through groups and at most one relation that is not `many`.
function previewField(collections: Record<string, Collection>, fields: Fields, path: string) {
  const keys = path.split(".");
  for (let i = 1; i < keys.length; i++) {
    const f = fieldAt(fields, keys.slice(0, i).join("."));
    if (f?.type === "relation" && !f.many)
      return stored(collections[f.collection]!.fields, keys.slice(i).join("."));
  }
  return stored(fields, path);
}

function stored(fields: Fields, path: string) {
  const f = fieldAt(fields, path);
  return f && f.type !== "group" && f.type !== "join" ? f : undefined;
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
