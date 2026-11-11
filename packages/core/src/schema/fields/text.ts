import { z } from "zod";
import type { Text } from "../../admin/index.d.ts";
import type { Base } from "./common.ts";

/** Options of `text` and `textarea`. */
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
    /** `text` only, admin only: a fixed text in front of the input, like `https://`. Not stored. */
    prefix?: Text;
    /** `text` only, admin only: a fixed text after the input, like `.com`. Not stored. */
    suffix?: Text;
    /**
     * `text` only, admin only: an input mask, like `'#### #### #### ####'`. `#` is a digit, `@` a letter, `*` either.
     * The admin shows the masked value and stores only the typed characters. `minLength`, `maxLength` and `pattern`
     * check that stored value, so only the server checks them. See https://beholdr.github.io/maska/.
     */
    mask?: string;
    /** `textarea` only, admin only: the height of the empty input in lines. It grows with the content. Default `8`. */
    rows?: number;
  };

// Browsers compile the HTML `pattern` attribute with the `v` flag. The server MUST match them.
/**
 * The validator of a `text` or `textarea` field. The pattern compiles even when `on` is false, so an invalid one always throws.
 * @returns A plain string check when `on` is false.
 */
export function textSchema(field: TextField, on: boolean): z.ZodType {
  const pattern =
    field.pattern === undefined ? undefined : new RegExp(`^(?:${field.pattern})$`, "v");
  if (!on) return z.string();
  let s = z.string().min(Math.max(field.minLength ?? 0, field.required ? 1 : 0));
  if (field.maxLength !== undefined) s = s.max(field.maxLength);
  if (pattern) s = s.regex(pattern);
  return field.required ? s : z.literal("").or(s);
}
