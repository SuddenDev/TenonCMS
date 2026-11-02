// This file MUST import only `url.ts` and types. The admin bundles it.
import type { LinkReference, LinkValue } from "../config/types.ts";
import { isLinkSuffix, safeLinkUrl } from "./url.ts";

const TARGETS = ["_self", "_blank", "_parent", "_top"];

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Checks a stored link value: exactly one of `reference` and `href`, a safe `href`, and a known `target`.
 * @throws {Error} With a message for the field error.
 */
export function checkLinkValue(value: unknown): asserts value is LinkValue {
  if (!isRecord(value) || "reference" in value === "href" in value) throw new Error("Invalid link");

  const { reference: ref, href, target } = value;
  if (
    "reference" in value &&
    (!isRecord(ref) ||
      typeof ref.collection !== "string" ||
      !ref.collection ||
      typeof ref.id !== "string" ||
      !ref.id ||
      (ref.deleted !== undefined && ref.deleted !== true))
  )
    throw new Error("Invalid link reference");
  if ("href" in value && (!href || !safeLinkUrl(href))) throw new Error("Unsafe URL");
  if (target !== undefined && !TARGETS.includes(target)) throw new Error("Invalid link target");
  if ("suffix" in value && !isLinkSuffix(value.suffix)) throw new Error("Invalid link suffix");
}

/**
 * Removes read decoration and unknown keys before a write. A value with a `reference` loses its `href`, `title` and
 * `broken`. A `suffix` stays. Anything that is not an object stays as it is.
 * @returns A copy, which {@link checkLinkValue} then checks.
 */
export function storedLink(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const target = {
    ...(value.target !== undefined && { target: value.target }),
    ...(value.suffix !== undefined && { suffix: value.suffix }),
  };
  if (!("reference" in value))
    return "href" in value ? { href: value.href, ...target } : { ...target };

  const ref = value.reference;
  const reference = isRecord(ref)
    ? {
        collection: ref.collection,
        id: ref.id,
        ...(ref.deleted !== undefined && { deleted: ref.deleted }),
      }
    : ref;
  return { reference, ...target };
}

/** The key of a link target in maps and sets. */
export const linkKey = (reference: Pick<LinkReference, "collection" | "id">) =>
  `${reference.collection}:${reference.id}`;
