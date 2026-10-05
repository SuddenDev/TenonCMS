import { type Core } from "../cms/runtime/types.ts";
import { ValidationError } from "../errors.ts";

/** The target of an operation. Hooks get it as `collection` or `global`. */
export type Name = { kind: "collection" | "global"; name: string };

/**
 * Names a collection.
 * @returns The collection target.
 */
export function col(name: string): Name {
  return { kind: "collection", name };
}

/**
 * Names a global.
 * @returns The global target.
 */
export function glob(name: string): Name {
  return { kind: "global", name };
}

/**
 * Looks up the schema entry of a target.
 * @returns The fields and hooks of the collection or global.
 */
export function target({ schema }: Core, { kind, name }: Name) {
  return kind === "collection" ? schema.collections[name] : schema.globals[name];
}

/**
 * Checks that the target allows drafts.
 * @throws {ValidationError} When the collection or global has `drafts: false`.
 */
export function draftable(core: Core, name: Name) {
  if (target(core, name).drafts === false)
    throw new ValidationError({ "": `Drafts are off for "${name.name}"` });
}

/**
 * Checks that the schema has the collection or global.
 * @throws {Error} For an unknown collection or global.
 */
export function known({ schema }: Core, kind: Name["kind"], name: string) {
  const owners = kind === "collection" ? schema.collections : schema.globals;
  if (!Object.hasOwn(owners, name)) throw new Error(`Unknown ${kind} "${name}"`);
}

/**
 * The media library runs media hooks instead of collection and root hooks.
 * @returns Whether `name` is the media library.
 */
export function isMedia(name: Name) {
  return name.kind === "collection" && name.name === "media";
}
