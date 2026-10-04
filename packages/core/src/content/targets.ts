import { type Core } from "../cms/runtime/types.ts";
import { ValidationError } from "../errors.ts";

/** The target of an operation. Hooks get it as `collection` or `global`. */
export type Name = { kind: "collection" | "global"; name: string };
export const col = (name: string): Name => ({ kind: "collection", name });
export const glob = (name: string): Name => ({ kind: "global", name });
/** The fields and hooks of a collection or global. */
export const target = ({ schema }: Core, { kind, name }: Name) =>
  kind === "collection" ? schema.collections[name] : schema.globals[name];

/** Throws when the collection or global has `drafts: false`. */
export function draftable(core: Core, name: Name) {
  if (target(core, name).drafts === false)
    throw new ValidationError({ "": `Drafts are off for "${name.name}"` });
}

/** Throws for an unknown collection or global. */
export function known({ schema }: Core, kind: Name["kind"], name: string) {
  const owners = kind === "collection" ? schema.collections : schema.globals;
  if (!Object.hasOwn(owners, name)) throw new Error(`Unknown ${kind} "${name}"`);
}

/** Whether `name` is the media library, which runs media hooks instead of collection and root hooks. */
export const isMedia = (name: Name) => name.kind === "collection" && name.name === "media";
