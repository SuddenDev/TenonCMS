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
   * The features the editor offers: built-in names and keys of `admin.richtext.extensions`. Default: `heading`,
   * `bold`, `italic`, `link`, `bulletList`, `orderedList`, `blockquote` and every registered extension.
   */
  allowed?: readonly (RichtextFeature | (string & {}))[];
  /** CSS classes the editor MAY apply to blocks and text. See {@link RichtextClass}. */
  classes?: readonly RichtextClass[];
};

/** Structural checks also apply to drafts and inactive fields. */
export function richtextFieldSchema() {
  return z.custom<RichtextDocument>((value) => {
    try {
      checkRichtextShape(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid rich text document");
}
