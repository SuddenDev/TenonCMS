import type { Schema } from "@tiptap/pm/model";
import { richtextSchema, RICHTEXT_FEATURES } from "./extensions.ts";
import { walkRichtext } from "./walk.ts";
import type { RichtextDocument, RichtextRegistration } from "../config/types.ts";

/** Accepts web URLs, email, telephone, relative paths and fragments. */
export function safeRichtextUrl(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\p{Cc}]/u.test(value)) return false;
  return !/^[a-z][a-z\d+.-]*:/i.test(value) || /^(https?:|mailto:|tel:)/i.test(value);
}

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

/** Validates changed content using the active field's feature policy. */
export function validateRichtext(
  value: unknown,
  field: { allowed?: readonly string[]; required?: boolean },
  registrations: Record<string, RichtextRegistration> = {},
) {
  checkRichtextShape(value);
  const schema = richtextSchema(field.allowed, registrations);
  const meaningful = checkRichtextContent(value, schema);
  if (field.required && !meaningful) throw new Error("Rich text is required");
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

/** Checks feature names once during configuration assembly. */
export function checkRichtextAllowed(
  allowed: readonly string[] | undefined,
  registrations: Record<string, RichtextRegistration>,
) {
  for (const name of allowed ?? [])
    if (
      !(RICHTEXT_FEATURES as readonly string[]).includes(name) &&
      !Object.hasOwn(registrations, name)
    )
      throw new Error(`tenoncms: unknown rich text feature "${name}"`);

  richtextSchema(allowed, registrations);
}
