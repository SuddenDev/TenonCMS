import { z } from "zod";
import type { Base } from "./common.ts";
import type { LinkKind, LinkValue } from "../../links/config/types.ts";
import { checkLinkValue, storedLink } from "../../links/runtime/value.ts";

/** A link to a document of a collection with a `permalink`, to a URL or to a media file. Not filterable and never `unique`. */
export type LinkField = Base<LinkValue> & {
  type: "link";
  /**
   * What the link MAY point to: `'internal'` (a document with a `permalink`), `'external'` (a typed URL, relative ones
   * included) and `'file'` (a media file, only with media). Checked on every write, drafts included. Default: all.
   */
  allowed?: readonly LinkKind[];
};

/** Strips read decoration, then checks the shape and the URL. Also applies to drafts and inactive fields. */
export function linkFieldSchema() {
  return z
    .unknown()
    .transform(storedLink)
    .superRefine((value, ctx) => {
      try {
        checkLinkValue(value);
      } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message });
      }
    }) as unknown as z.ZodType<LinkValue>;
}
