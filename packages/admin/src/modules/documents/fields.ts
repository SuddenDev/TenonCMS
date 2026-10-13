import type { InjectionKey, Ref } from "vue";
import { matchCondition } from "../../../../core/src/schema/condition";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";
import type { Collection, Field, Fields } from "../../../../core/src/schema";

/** Field shown as a document's title in lists and page titles. */
export function titleField(collection: Pick<Collection, "titleField" | "fields">) {
  return (
    collection.titleField ??
    Object.keys(collection.fields).find(
      (k) => !["group", "array", "blocks", "join"].includes(collection.fields[k].type),
    ) ??
    ""
  );
}

/** A group value is empty when every value is null, '', false, [] or an empty group. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || value === false) return true;
  return typeof value === "object" && Object.values(value).every(isEmpty);
}

/** Whether a field applies, by its `condition`. `root` is the whole form data, `sibling` the object that holds the field. */
export function active(field: Field, root: unknown, sibling: unknown) {
  return !field.condition || matchCondition(field.condition, root, sibling);
}

/** Reloads what the view around a document shows: the list. Document panes call it after a save or delete. */
export const reloadKey: InjectionKey<() => void> = Symbol("reload");

/** Keeps the pane of a new document when the route switches to the id from its first draft save, so typing goes on. */
export const keepPaneKey: InjectionKey<(id: string) => void> = Symbol("keepPane");

/** Opens a referenced document in a pane to the right. Provided only in the pane layout. */
export const openRefKey: InjectionKey<(collection: string, id: string) => void> = Symbol("openRef");

/** Dot path of the field to focus. The matching `FieldInput` scrolls to its input, focuses it and clears the path. */
export const focusKey: InjectionKey<Ref<string | null>> = Symbol("focus");

/** The document or global that holds the form's fields, for the server loaders of custom fields. A new document has no `id`. */
export type Owner = { collection: string; id?: string } | { global: string };
export const ownerKey: InjectionKey<Readonly<Ref<Owner>>> = Symbol("owner");

/**
 * Shapes form data for the inputs and for the payload.
 * - Groups always render as objects, so their inputs have a model to bind to.
 * - On save, an optional group with only empty values becomes null, so its required children do not apply.
 * - Empty strings become null, so cleared optional fields pass validation.
 * - Joins are not stored, so they stay out of the form data.
 * - Arrays and blocks are lists of items. Each item keeps its `id` (a missing one is created) and its fields follow the same rules.
 *   A block item also keeps its `blockType`; an item of an unknown block stays as it is.
 * - `fill`: use defaults for missing values. Like on the server, children of an optional group get them only when the group has a value.
 * - On save, a field whose condition is false becomes null. Conditions read the form data as it is, so '' and null count the same.
 */
export function normalize(
  fields: Fields,
  value: Record<string, any> | null | undefined,
  save = false,
  fill = false,
  root: unknown = value,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([k, f]) => {
      if (f.type === "join") return [];
      if (save && !active(f, root, value)) return [[k, null]];
      const v = value?.[k] === undefined && fill ? structuredClone(f.default) : value?.[k];
      if (f.type === "group") {
        const g = normalize(f.fields, v, save, fill && (f.required || v != null), root);
        return [[k, save && !f.required && isEmpty(g) ? null : g]];
      }
      if (f.type === "array" || f.type === "blocks") {
        const items = (Array.isArray(v) ? v : []).flatMap((item) => {
          if (typeof item !== "object" || item === null) return [];
          const id = item.id ?? crypto.randomUUID();
          const inner = itemFields(f, item);
          // An unknown block has no fields to shape: keep its data.
          if (!inner) return [{ ...item, id }];
          return [
            {
              id,
              ...(f.type === "blocks" && { blockType: item.blockType }),
              ...normalize(inner, item, save, fill, root),
            },
          ];
        });
        return [[k, items]];
      }
      if (f.type === "boolean") return [[k, v ?? false]];
      if ((f.type === "relation" || f.type === "image" || f.type === "file") && f.many)
        return [[k, v ?? []]];
      return [[k, v === "" || v === undefined ? null : v]];
    }),
  );
}
