import { type Condition } from "../condition.ts";
import { fieldAt } from "../traversal/field-at.ts";
import { isRef, targetOf } from "../traversal/reference-fields.ts";
import { relationPaths } from "../traversal/relation-paths.ts";
import { placeholders } from "../../preview/templates/placeholders.ts";
import { type Collection, type Fields, type Preview, type Schema } from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";

type Collections = Record<string, Collection>;

/** A collection or global with the parts the checks need. */
type Owner = { name: string; fields: Fields; preview?: Preview; global: boolean };

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

/**
 * Checks that the schema can work. Runs once while the instance is built.
 * @throws {Error} For a populate depth above the limit, a relation or join that does not fit, a condition on an unknown
 * field, `unique` where it cannot apply, an invalid `pattern`, or a `preview` placeholder on an unknown field.
 */
export function checkSchema(schema: Schema, populate: { depth: number; maxDepth: number }) {
  const collections = schema.collections ?? {};
  if (populate.depth > populate.maxDepth)
    fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`);

  for (const owner of owners(schema)) {
    checkRelations(collections, owner);
    checkJoins(collections, owner);
    checkFields(owner.fields, owner.fields, owner.name, !owner.global);
    checkPreview(collections, owner);

    // Compiles every `pattern`, so an invalid one throws here.
    dataSchema(owner.fields);
  }
}

function fail(message: string): never {
  throw new Error(`integral-cms: ${message}`);
}

// Collections first, then globals.
function owners(schema: Schema): Owner[] {
  return [
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
}

// Every reference MUST point to a known collection and use an `onDelete` that fits it.
function checkRelations(collections: Collections, { name, fields, global }: Owner) {
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
}

// Joins live at the top level of a collection, and `on` MUST be a relation back to it.
function checkJoins(collections: Collections, { name, fields, global }: Owner) {
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

// Each placeholder of a `preview` template MUST name a stored field.
function checkPreview(collections: Collections, { name, fields, preview }: Owner) {
  if (typeof preview !== "string") return;
  for (const path of placeholders(preview))
    if (!previewField(collections, fields, path))
      fail(`preview of "${name}" names unknown field "${path}"`);
}

// A stored field through groups and at most one relation that is not `many`.
function previewField(collections: Collections, fields: Fields, path: string) {
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
