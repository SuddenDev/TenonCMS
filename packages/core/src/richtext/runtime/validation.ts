import type { Schema } from "@tiptap/pm/model";
import { richtextSchema, RICHTEXT_FEATURES } from "./extensions.ts";
import { walkRichtext } from "./walk.ts";
import { safeLinkUrl } from "../../links/runtime/url.ts";
import type { RichtextClass, RichtextDocument, RichtextRegistration } from "../config/types.ts";

/** Accepts web URLs, email, telephone, relative paths and fragments. The rules of every link, see `safeLinkUrl()`. */
export const safeRichtextUrl = safeLinkUrl;

/** Checks document shape before the schema parser can drop unknown nodes, marks or attributes. */
export function checkRichtextShape(value: unknown, depth = 0): asserts value is RichtextDocument {
  if (depth > 100 || !value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid rich text document");

  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || (!depth && node.type !== "doc"))
    throw new Error("Invalid rich text node");
  if (node.text !== undefined && typeof node.text !== "string")
    throw new Error("Invalid rich text text");
  if (
    node.attrs !== undefined &&
    (!node.attrs || typeof node.attrs !== "object" || Array.isArray(node.attrs))
  )
    throw new Error("Invalid rich text attributes");

  for (const key of ["content", "marks"]) {
    if (node[key] === undefined) continue;
    if (!Array.isArray(node[key])) throw new Error("Invalid rich text children");

    for (const child of node[key]) checkRichtextShape(child, depth + 1);
  }

  walkAttributes(node.attrs as Record<string, any> | undefined);
}

function walkAttributes(attrs?: Record<string, any>) {
  if (!attrs) return;

  for (const key of ["href", "src"])
    if (attrs[key] != null && !safeRichtextUrl(attrs[key])) throw new Error("Unsafe rich text URL");

  if (
    attrs.srcset != null &&
    (typeof attrs.srcset !== "string" ||
      (attrs.srcset &&
        !attrs.srcset.split(",").every((candidate: string) => {
          const [url, descriptor, ...rest] = candidate.trim().split(/\s+/);
          return (
            safeRichtextUrl(url) &&
            !rest.length &&
            (!descriptor || /^\d+(?:\.\d+)?[wx]$/.test(descriptor))
          );
        })))
  )
    throw new Error("Unsafe image srcset");
  if (attrs.class != null && typeof attrs.class !== "string") throw new Error("Invalid class");
  if (attrs.target != null && !["_self", "_blank", "_parent", "_top"].includes(attrs.target))
    throw new Error("Invalid link target");
  if (attrs.level != null && ![1, 2, 3, 4, 5, 6].includes(attrs.level))
    throw new Error("Invalid heading level");
  if (attrs.textAlign != null && !["left", "center", "right", "justify"].includes(attrs.textAlign))
    throw new Error("Invalid text alignment");

  for (const key of ["color", "backgroundColor"])
    if (
      attrs[key] != null &&
      (typeof attrs[key] !== "string" ||
        !/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(
          attrs[key],
        ))
    )
      throw new Error("Invalid text color");

  const ref = attrs.reference;
  if (
    ref != null &&
    (typeof ref !== "object" ||
      Array.isArray(ref) ||
      typeof ref.collection !== "string" ||
      !ref.collection ||
      typeof ref.id !== "string" ||
      !ref.id ||
      (ref.deleted !== undefined && ref.deleted !== true))
  )
    throw new Error("Invalid rich text reference");
}

type RichtextPolicy = {
  allowed?: readonly string[];
  classes?: readonly RichtextClass[];
  required?: boolean;
};

/** Validates changed content using the active field's feature policy and classes. */
export function validateRichtext(
  value: unknown,
  field: RichtextPolicy,
  registrations: Record<string, RichtextRegistration> = {},
) {
  checkRichtextShape(value);
  const meaningful = checkRichtextContent(value, richtextSchema(field, registrations));
  requireListedClasses(value, field.classes);
  if (field.required && !meaningful) throw new Error("Rich text is required");
}

// The schema only knows that a class attribute exists. The names come from the field.
function requireListedClasses(value: RichtextDocument, classes: readonly RichtextClass[] = []) {
  walkRichtext(value, (node) => {
    const name = node.attrs?.class;
    if (name == null) return;

    const on = node.type === "textClass" ? "text" : "block";
    if (!classes.some((c) => c.on === on && c.name === name))
      throw new Error(`Unknown class "${name}"`);
  });
}

/** Checks every type and attribute before schema parsing can discard unsupported content. */
export function checkRichtextContent(value: unknown, schema: Schema) {
  checkRichtextShape(value);
  let meaningful = false;

  walkRichtext(value, (node) => {
    const spec = schema.nodes[node.type] ?? schema.marks[node.type];
    if (!spec) throw new Error(`Unsupported rich text type "${node.type}"`);

    for (const key of Object.keys(node.attrs ?? {}))
      if (!Object.hasOwn(spec.spec.attrs ?? {}, key))
        throw new Error(`Unsupported attribute "${key}"`);

    if (node.text?.trim() || node.type === "image" || spec.spec.atom) meaningful = true;
  });

  schema.nodeFromJSON(value).check();

  return meaningful;
}

/**
 * A copy of `value` without the marks and attributes that `schema` lacks, so content with formatting the field does not
 * offer stays editable. Unknown nodes stay, because dropping them would lose content.
 * @returns The copy, and the names of the dropped marks and attributes.
 */
export function pruneRichtext(value: RichtextDocument, schema: Schema) {
  // A JSON copy, because `structuredClone` throws on the admin's reactive proxies.
  const copy: RichtextDocument = JSON.parse(JSON.stringify(value));
  const dropped = new Set<string>();

  walkRichtext(copy, (node) => {
    node.marks = node.marks?.filter((mark) => !!schema.marks[mark.type] || !dropped.add(mark.type));
    const spec = schema.nodes[node.type] ?? schema.marks[node.type];
    for (const key of Object.keys(node.attrs ?? {}))
      if (spec && !Object.hasOwn(spec.spec.attrs ?? {}, key)) {
        dropped.add(key);
        delete node.attrs![key];
      }

    if (!node.marks?.length) delete node.marks;
    if (node.attrs && !Object.keys(node.attrs).length) delete node.attrs;
  });

  return { value: copy, dropped: [...dropped] };
}

/** Checks feature names and classes once during configuration assembly. */
export function checkRichtextField(
  field: RichtextPolicy,
  registrations: Record<string, RichtextRegistration>,
) {
  for (const name of field.allowed ?? [])
    if (
      !(RICHTEXT_FEATURES as readonly string[]).includes(name) &&
      !Object.hasOwn(registrations, name)
    )
      throw new Error(`tenoncms: unknown rich text feature "${name}"`);

  const seen = new Set<string>();
  for (const { name, on } of field.classes ?? []) {
    if (on !== "block" && on !== "text")
      throw new Error(`tenoncms: rich text class "${name}" needs \`on: 'block'\` or \`'text'\``);
    if (typeof name !== "string" || !/^\S+(?: \S+)*$/.test(name))
      throw new Error(`tenoncms: invalid rich text class "${name}"`);
    if (seen.has(`${on}:${name}`)) throw new Error(`tenoncms: duplicate rich text class "${name}"`);
    seen.add(`${on}:${name}`);
  }

  richtextSchema(field, registrations);
}
