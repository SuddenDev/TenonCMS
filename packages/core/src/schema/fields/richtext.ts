import { z } from "zod";
import type { Base } from "./common.ts";
import type { RichtextDocument } from "../../richtext/config/types.ts";
import { checkRichtextShape } from "../../richtext/runtime/validation.ts";

/** A standard Tiptap JSON document with optional feature restrictions. */
export type RichtextField = Base<RichtextDocument> & {
  type: "richtext";
  allowed?: readonly string[];
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
