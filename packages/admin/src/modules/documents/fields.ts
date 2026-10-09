import type { InjectionKey, Ref } from "vue";
import { matchCondition } from "../../../../core/src/schema/condition";
import type { Collection, Field } from "../../../../core/src/schema";

/** Field shown as a document's title in lists and page titles. */
export function titleField(collection: Collection) {
  return (
    collection.titleField ??
    Object.keys(collection.fields).find(
      (k) => !["group", "join"].includes(collection.fields[k].type),
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
