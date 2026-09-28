import { z } from "zod";
import type { Base } from "./common.ts";

// Options of `text` and `textarea`.
export type TextOptions = {
  /** Shown in the empty input. */
  placeholder?: string;
  /** Minimum number of characters. An empty optional value is not checked. */
  minLength?: number;
  /** Maximum number of characters. */
  maxLength?: number;
  /**
   * A regular expression source, e.g. `'[a-z0-9-]+'`. It MUST match the whole value; `^` and `$` are implied.
   * A string, not a `RegExp`, because the admin checks it too. It compiles with the `v` flag, like the HTML `pattern`
   * attribute. An empty optional value is not checked. `<textarea>` has no `pattern` attribute, so there only the server checks it.
   */
  pattern?: string;
};

/** One line (`text`) or several lines (`textarea`), stored as a string. */
export type TextField = Base &
  TextOptions & {
    /** `text`: one line. `textarea`: several lines. */
    type: "text" | "textarea";
  };

// Browsers compile the HTML `pattern` attribute with the `v` flag. The server MUST match them.
// Compiled even when unused, so an invalid pattern always throws.
export function textSchema(field: TextField, on: boolean): z.ZodType {
  const pattern =
    field.pattern === undefined ? undefined : new RegExp(`^(?:${field.pattern})$`, "v");
  if (!on) return z.string();
  let s = z.string().min(Math.max(field.minLength ?? 0, field.required ? 1 : 0));
  if (field.maxLength !== undefined) s = s.max(field.maxLength);
  if (pattern) s = s.regex(pattern);
  return field.required ? s : z.literal("").or(s);
}
