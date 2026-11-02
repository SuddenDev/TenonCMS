import { type Condition } from "../condition.ts";
import { fieldAt } from "../traversal/field-at.ts";
import { targetOf } from "../traversal/reference-fields.ts";
import { pathKey, plainPath, relationPaths } from "../traversal/relation-paths.ts";
import { blocksOf, unseenBlocks } from "../traversal/blocks-of.ts";
import { placeholders } from "../../preview/templates/placeholders.ts";
import { badSelectPath, metaKeys } from "../../content/population/validate-select.ts";
import type { Localization } from "../../cms/config/options.ts";
import {
  type ArrayField,
  type Block,
  type BlocksField,
  type Collection,
  type Field,
  type Fields,
  type Layout,
  type NumberField,
  type Preview,
  type SelectField,
  type Schema,
} from "../index.ts";
import { dataSchema } from "./build-data-schema.ts";
import { checkLayout } from "./check-layout.ts";
import { optionValue } from "../fields/select.ts";

type Collections = Record<string, Collection>;

/** A collection or global with the parts the checks need. */
type Owner = Layout & {
  name: string;
  fields: Fields;
  localized?: boolean;
  syncStructure?: boolean;
  preview?: Preview;
  permalink?: Preview;
  global: boolean;
};

const uniqueTypes = [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "select",
  "slug",
  "relation",
  "image",
  "file",
];

/**
 * Checks that the schema can work. Runs once while the instance is built.
 * @throws {Error} For a populate depth above the limit, a relation or join that does not fit, a condition on an unknown
 * field, `unique` where it cannot apply, an invalid `pattern`, a `preview` placeholder on an unknown field,
 * a `localized` option or `localization` config that does not fit, array or block items or row limits that do not
 * fit, select options or number options that do not fit, or an admin layout that names unknown tabs or fieldsets.
 */
export function checkSchema(
  schema: Schema,
  populate: { depth: number; maxDepth: number },
  localization?: Localization,
) {
  const collections = schema.collections ?? {};
  checkLocalization(localization);
  if (populate.depth > populate.maxDepth)
    fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`);

  for (const owner of owners(schema)) {
    checkRelations(collections, owner);
    checkJoins(collections, owner);
    checkFields(owner.fields, owner.fields, owner.name, !owner.global);
    checkLayout(owner.fields, owner, owner.name);
    checkPreview(collections, owner, localization?.routing === false);
    checkLocalized(owner, !!localization);

    // Compiles every `pattern`, so an invalid one throws here.
    dataSchema(owner.fields);
  }
}

function fail(message: string): never {
  throw new Error(`tenoncms: ${message}`);
}

// Collections first, then globals.
function owners(schema: Schema): Owner[] {
  return [
    ...Object.entries(schema.collections ?? {}).map(([name, c]) => ({
      name,
      fields: c.fields,
      localized: c.localized,
      syncStructure: c.syncStructure,
      preview: c.preview,
      permalink: c.permalink,
      tabs: c.tabs,
      fieldsets: c.fieldsets,
      global: false,
    })),
    ...Object.entries(schema.globals ?? {}).map(([name, g]) => ({
      name,
      fields: g.fields,
      localized: g.localized,
      syncStructure: g.syncStructure,
      preview: g.preview,
      permalink: g.permalink,
      tabs: g.tabs,
      fieldsets: g.fieldsets,
      global: true,
    })),
  ];
}

function checkLocalization(localization?: Localization) {
  if (!localization) return;
  const { locales, defaultLocale } = localization;
  if (!locales.length) fail("localization.locales MUST NOT be empty");
  const seen = new Set<string>();
  for (const locale of locales) {
    if (seen.has(locale)) fail(`duplicate locale "${locale}" in localization.locales`);
    seen.add(locale);
  }
  if (!seen.has(defaultLocale))
    fail(`localization.defaultLocale "${defaultLocale}" is not in locales`);
}

// `localized` needs the `localization` option. A field sets it only at the top level of a localized entry,
// never inside a group, an array item or a block item. `syncStructure` needs `localized` and is no field name.
function checkLocalized(
  { name, fields, localized, global, syncStructure }: Owner,
  enabled: boolean,
) {
  const kind = global ? "global" : "collection";
  if (syncStructure !== undefined && !localized)
    fail(`${kind} "${name}" sets syncStructure but is not localized`);
  for (const key of ["syncStructure", "syncStructureDefault"])
    if (Object.hasOwn(fields, key)) fail(`field "${name}.${key}" is a reserved field name`);
  if (localized && !enabled)
    fail(
      `${global ? "global" : "collection"} "${name}" is localized but the \`localization\` option is missing`,
    );
  if (localized && name === "media" && !global) fail(`collection "media" cannot be localized`);
  const seen = new Set<Block>();
  const walk = (fs: Fields, where: string, inside?: string) => {
    for (const [key, f] of Object.entries(fs)) {
      const at = `${where}.${key}`;
      if (f.localized !== undefined) {
        if (inside) fail(`field "${at}" cannot set localized inside ${inside}`);
        if (!localized)
          fail(`field "${at}" sets localized outside a localized collection or global`);
      }
      if (f.type === "group") walk(f.fields, at, inside ?? "a group");
      if (f.type === "array") walk(f.fields, at, "an array item");
      if (f.type === "blocks")
        for (const [name, b] of unseenBlocks(f, seen))
          walk(b.fields, `${at}.${name}`, "a block item");
    }
  };
  walk(fields, name);
}

// Every reference MUST point to a known collection and use an `onDelete` that fits it.
function checkRelations(collections: Collections, { name, fields, global }: Owner) {
  for (const { path, field } of relationPaths(fields)) {
    const at = `${field.type} "${name}.${pathKey(path)}"`;
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
    if (field.type === "relation" && field.select !== undefined) {
      const target = collections[to];
      const meta = metaKeys(target.localized);
      const error = badSelectPath(collections, target.fields, field.select, Infinity, "", meta);
      if (error) fail(`${at} has an invalid select path "${error}"`);
    }
  }
}

// Joins live at the top level of a collection, and `on` MUST be a relation back to it outside items.
function checkJoins(collections: Collections, { name, fields, global }: Owner) {
  for (const [key, f] of Object.entries(fields)) {
    if (f.type !== "join" && hasJoin({ [key]: f })) fail(`join inside ${f.type} "${name}.${key}"`);
    if (f.type !== "join") continue;
    if (global) fail(`join "${name}.${key}" in a global`);
    const source = Object.hasOwn(collections, f.collection)
      ? collections[f.collection].fields
      : undefined;
    const target = source && relationPaths(source).find((r) => plainPath(r.path) === f.on);
    if (!target || targetOf(target.field) !== name)
      fail(
        `join "${name}.${key}" needs "${f.on}" to be a relation to "${name}" in "${f.collection}"`,
      );
  }
}

function hasJoin(fields: Fields, seen = new Set<Block>()): boolean {
  return Object.values(fields).some((f) =>
    f.type === "join"
      ? true
      : f.type === "group" || f.type === "array"
        ? hasJoin(f.fields, seen)
        : f.type === "blocks" && unseenBlocks(f, seen).some(([, b]) => hasJoin(b.fields, seen)),
  );
}

// `top`: fields at the top level of a collection, the only place `unique` works.
function checkOptions(f: SelectField, at: string) {
  if (!f.options.length) fail(`select "${at}" has no options`);
  const seen = new Set<string>();
  for (const value of f.options.map(optionValue)) {
    if (seen.has(value)) fail(`select "${at}" repeats option "${value}"`);
    seen.add(value);
  }
}

function checkNumber(f: NumberField, at: string) {
  if (f.step !== undefined && !(f.step > 0)) fail(`number "${at}" needs a positive step`);
  if (f.appearance === "slider" && (f.min === undefined || f.max === undefined))
    fail(`slider "${at}" needs min and max`);
}

function checkFields(
  fields: Fields,
  root: Fields,
  where: string,
  top: boolean,
  seen = new Set<Block>(),
) {
  for (const [key, f] of Object.entries(fields)) {
    const at = `${where}.${key}`;
    if (
      "unique" in f &&
      f.unique &&
      (!top || !uniqueTypes.includes(f.type) || ("many" in f && f.many))
    )
      fail(`"${at}" cannot be unique`);
    if (f.type === "select") checkOptions(f, at);
    if (f.type === "number") checkNumber(f, at);
    for (const path of conditionPaths(f.condition ?? {})) {
      const rooted = path.startsWith("/");
      const crossed = crossedList(rooted ? root : fields, rooted ? path.slice(1) : path);
      if (crossed)
        fail(
          `condition on "${at}" names "${path}" inside ${crossed === "array" ? "an array" : "blocks"}`,
        );
      const target = path.startsWith("/") ? fieldAt(root, path.slice(1)) : fieldAt(fields, path);
      if (!target) fail(`condition on "${at}" names unknown field "${path}"`);
    }
    if (f.type === "group") checkFields(f.fields, root, at, false, seen);
    if (f.type === "array") {
      checkItems(f, at);
      checkFields(f.fields, root, at, false, seen);
    }
    if (f.type === "blocks") {
      checkItems(f, at);
      for (const [name, b] of unseenBlocks(f, seen))
        checkFields(b.fields, root, `${at}.${name}`, false, seen);
    }
  }
}

// `id` is reserved in every item, `blockType` in every block item.
function checkItems(f: ArrayField | BlocksField, at: string) {
  if (f.type === "array" && Object.hasOwn(f.fields, "id"))
    fail(`array "${at}" cannot have an item field named "id"`);
  if (f.type === "blocks") {
    if (!Object.keys(f.blocks).length) fail(`blocks "${at}" has no blocks`);
    for (const [name, b] of Object.entries(blocksOf(f)))
      for (const reserved of ["id", "blockType"])
        if (Object.hasOwn(b.fields, reserved))
          fail(`blocks "${at}.${name}" cannot have an item field named "${reserved}"`);
  }
  for (const option of ["minRows", "maxRows"] as const)
    if ((f[option] ?? 0) < 0) fail(`${f.type} "${at}" has a negative ${option}`);
  if (f.minRows !== undefined && f.maxRows !== undefined && f.minRows > f.maxRows)
    fail(`${f.type} "${at}" has minRows above maxRows`);
}

// A condition MUST NOT look into items, because it cannot know which item it means.
// Returns the type of the first list the path crosses.
function crossedList(fields: Fields, path: string) {
  let current: Fields | undefined = fields;
  for (const key of path.split(".").slice(0, -1)) {
    const f: Field | undefined = current && Object.hasOwn(current, key) ? current[key] : undefined;
    if (f?.type === "array" || f?.type === "blocks") return f.type;
    current = f?.type === "group" ? f.fields : undefined;
  }
}

function conditionPaths(condition: Condition): string[] {
  return Object.entries(condition).flatMap(([key, c]) =>
    key === "$every" || key === "$some" ? (c as Condition[]).flatMap(conditionPaths) : [key],
  );
}

// Each placeholder of a `preview` or `permalink` template MUST name a stored field. `{locale}` is allowed without routing.
function checkPreview(
  collections: Collections,
  { name, fields, preview, permalink }: Owner,
  locale: boolean,
) {
  for (const [option, template] of [
    ["preview", preview],
    ["permalink", permalink],
  ] as const) {
    if (typeof template !== "string") continue;
    for (const path of placeholders(template))
      if (!(locale && path === "locale") && !previewField(collections, fields, path))
        fail(`${option} of "${name}" names unknown field "${path}"`);
  }
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
