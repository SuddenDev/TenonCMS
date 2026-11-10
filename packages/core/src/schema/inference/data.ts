import type { RichtextDocument } from "../../richtext/config/types.ts";
import type { LinkValue } from "../../links/config/types.ts";
import type { Field, Fields, SizeValue } from "../fields/index.ts";
import type { Keys } from "./common.ts";

type Scalar = {
  richtext: RichtextDocument;
  link: LinkValue;
  text: string;
  textarea: string;
  date: string;
  datetime: string;
  slug: string;
  number: number;
  boolean: boolean;
};

/** The stored value of a `select` option. */
type OptionValue<O> = O extends { value: infer V } ? V : O;

/** The stored ids of a reference field: an array with `many`, else one id. */
export type Ids<F> = F extends { many: true } ? string[] : string;

/**
 * The stored items of a `blocks` field: one object type per block, told apart by `blockType`. `id` is optional, as in
 * array items.
 */
type BlockItem<B extends Record<string, { fields: Fields }>> = {
  [K in keyof B & string]: { id?: string; blockType: K } & Data<B[K]["fields"]>;
}[keyof B & string];

/** The stored value of one field. An array item's `id` is optional, because a write MAY leave it out; reads always have it. */
export type FieldValue<F extends Field> = F extends {
  type: "group";
  fields: infer G extends Fields;
}
  ? Data<G>
  : F extends { type: "array"; fields: infer G extends Fields }
    ? ({ id?: string } & Data<G>)[]
    : F extends { type: "blocks"; blocks: infer B extends Record<string, { fields: Fields }> }
      ? BlockItem<B>[]
      : F extends { type: "select"; options: readonly (infer O)[] }
        ? F extends { many: true }
          ? OptionValue<O>[]
          : OptionValue<O>
        : F extends { type: "relation" | "image" | "file" }
          ? Ids<F>
          : F extends { type: "size" }
            ? SizeValue<F extends { units: readonly (infer U extends string)[] } ? U : never>
            : F extends { type: keyof Scalar }
              ? Scalar[F["type"]]
              : string;

export type JoinKey<F> = Keys<F, { type: "join" }>;
export type RequiredKey<F> = Keys<F, { required: true }>;

type RequiredData<F extends Fields> = {
  [K in Exclude<RequiredKey<F>, JoinKey<F>>]: FieldValue<F[K]>;
};
type OptionalData<F extends Fields> = {
  [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: FieldValue<F[K]> | null;
};

/** The stored data of `F`. Joins are not stored. */
export type Data<F extends Fields> = RequiredData<F> & OptionalData<F>;

/** The metadata of every stored document. */
export type Meta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** The id of the user who created the document. `null` for server code. Missing for readers without a user. */
  createdBy?: string | null;
  /** The id of the user who last changed the document. `null` for server code. Missing for readers without a user. */
  updatedBy?: string | null;
  /** When the document was last published. `null`: never published. */
  publishedAt: string | null;
  /** Whether a draft is pending. */
  hasDraft: boolean;
};

/** A stored document of `F` with its metadata. */
export type Doc<F extends Fields> = Data<F> & Meta;

/** The meta of a global read. A `select` leaves it out. */
export type GlobalMeta<S = true> = [S] extends [true]
  ? Pick<Meta, "publishedAt" | "hasDraft"> & {
      /** When the global last changed. Missing for a global that was never saved. */
      updatedAt?: string;
    }
  : {};

/** `permalink` of a read with the `permalink` option. A `select` keeps it only when it lists it. */
export type PermalinkMeta<Options, SelectSpec> = Options extends { permalink: true }
  ? [SelectSpec] extends [true]
    ? { permalink: string | null }
    : SelectSpec extends { permalink: true }
      ? { permalink: string | null }
      : {}
  : {};

/** A populated `file` field: a document of the media library. */
export type File = Meta & {
  /** URL of the original. Computed on read. */
  url: string;
  /** Folder path, `''` at the root, e.g. `blog/2026`. */
  folder: string;
  filename: string;
  /** Storage key: `folder/filename`, or `filename` at the root. */
  key: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  alt?: string | null;
};

/** A populated `image` field: a `File` with dimensions, and `src` and `srcset` built from the field's `image` options. */
export type Image = File & {
  /** URL of the default variant, or of the original without an image provider. */
  src: string;
  /** Variants for `<img srcset>`. Empty without an image provider. */
  srcset: string;
  width: number;
  height: number;
};

/** A populated `image` or `file`, or several with `many`. */
export type MediaValue<F, T> = F extends { many: true } ? T[] : T;

/** Field keys that `where` accepts. Rich text, links, sizes, groups, arrays, blocks, joins and `many` relations and selects are not filterable. */
export type FilterKey<F extends Fields> = Exclude<
  keyof F,
  Keys<
    F,
    { type: "group" | "array" | "blocks" | "join" | "richtext" | "link" | "size" } | { many: true }
  >
>;
