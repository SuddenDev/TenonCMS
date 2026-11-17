import { z } from "zod";
import type { Base } from "./common.ts";
import type {
  RichtextClass,
  RichtextDocument,
  RichtextFeature,
} from "../../richtext/config/types.ts";
import { checkRichtextShape } from "../../richtext/runtime/validation.ts";

/** A standard Tiptap JSON document with optional feature restrictions. */
export type RichtextField = Base<RichtextDocument> & {
  type: "richtext";
  /**
   * The features the editor offers: built-in names and keys of `richtext.extensions`. Default: `heading`,
   * `bold`, `italic`, `link`, `bulletList`, `orderedList`, `blockquote` and every registered extension.
   */
  allowed?: readonly (RichtextFeature | (string & {}))[];
  /** CSS classes the editor MAY apply to blocks and text. See {@link RichtextClass}. */
  classes?: readonly RichtextClass[];
};

/** Structural checks also apply to drafts and inactive fields. */
export function richtextFieldSchema() {
  return z.custom<RichtextDocument>().superRefine((value, ctx) => {
    try {
      checkRichtextShape(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
    }
  });
}
