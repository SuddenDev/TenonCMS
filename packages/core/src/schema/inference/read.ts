import type { Field, Fields } from "../fields/index.ts";
import type { FieldsOf, Simplify } from "./common.ts";
import type { LinkRead, LinkValue } from "../../links/config/types.ts";
import type {
  FieldValue,
  File,
  Ids,
  Image,
  JoinKey,
  MediaValue,
  Meta,
  RequiredKey,
} from "./data.ts";

// The populate spec is `false` (ids), a number (hops left), or an object. `Sub` and `Next` are the
// type-level twins of `step()` in `content/population/populate-plan.ts`.

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The populate spec for `Key`. */
export type Sub<Spec, Key> = Spec extends number
  ? Spec
  : Spec extends object
    ? Key extends keyof Spec
      ? Spec[Key]
      : false
    : false;

/** The spec the documents under a resolved relation get. */
export type Next<Spec> = Spec extends true ? false : Spec extends number ? Prev[Spec] : Spec;

/** Whether `Spec` leaves a relation as ids. */
export type Off<Spec> = Spec extends false | 0 | undefined ? true : false;

/**
 * The select spec for `Key`: `true` when `Sel` selects everything or does not list `Key`. Only an object turns off
 * a relation's own `select`; the read's `Selected` drops unlisted keys anyway.
 */
type SelAt<Sel, Key> = [Sel] extends [true] ? true : Key extends keyof Sel ? Sel[Key] : true;

/** Join keys a read leaves out: every join, unless a populate object names it. */
type UnpopulatedJoins<F, Spec> = Exclude<JoinKey<F>, Spec extends object ? keyof Spec : never>;

/** Documents of `Collection` with relations resolved as `Spec` says. */
type Target<Collections, Collection, Spec, Sel> = Collection extends keyof Collections
  ? Simplify<Resolve<Collections, FieldsOf<Collections, Collection>, Spec, Sel> & Meta>
  : never;
type Targets<Collections, Collection, Spec, Sel, Relation> = Relation extends { many: true }
  ? Target<Collections, Collection, Spec, Sel>[]
  : Target<Collections, Collection, Spec, Sel>;

type GroupValue<Collections, Group extends Fields, Spec, Sel> = Resolve<
  Collections,
  Group,
  Spec extends true ? 1 : Spec,
  Sel
>;
/** Array items read like a group, and every item has its `id`. */
type ArrayValue<Collections, Item extends Fields, Spec, Sel> = Simplify<
  { id: string } & GroupValue<Collections, Item, Spec, Sel>
>[];
/** Each block reads like a group with the spec of its block name. A number or `true` passes to every block. */
type BlocksValue<Collections, Blocks extends Record<string, { fields: Fields }>, Spec, Sel> = {
  [K in keyof Blocks & string]: Simplify<
    { id: string; blockType: K } & GroupValue<
      Collections,
      Blocks[K]["fields"],
      Sub<Spec extends true ? 1 : Spec, K>,
      SelAt<Sel, K>
    >
  >;
}[keyof Blocks & string][];
/** A relation with its own `select` keeps only those fields, unless the read selects inside it with an object. */
type RelationValue<Collections, Relation, Spec, Sel> = Relation extends {
  collection: infer Collection;
}
  ? Off<Spec> extends true
    ? Ids<Relation>
    : [Sel] extends [true]
      ? Relation extends { select: infer Own extends object }
        ? Selected<Targets<Collections, Collection, Next<Spec>, Own, Relation>, Own>
        : Targets<Collections, Collection, Next<Spec>, true, Relation>
      : Targets<Collections, Collection, Next<Spec>, Sel, Relation>
  : never;
type MediaFieldValue<MediaField, Spec> =
  Off<Spec> extends true
    ? Ids<MediaField>
    : MediaValue<MediaField, MediaField extends { type: "image" } ? Image : File>;
type JoinValue<Collections, Join, Spec, Sel> = Join extends { collection: infer Collection }
  ? Target<Collections, Collection, Next<Spec>, Sel>[]
  : never;

/** The value of one field in a read, using the populate spec and the select spec for that field. */
type FieldReadValue<Collections, FieldType, Spec, Sel> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? GroupValue<Collections, Group, Spec, Sel>
  : FieldType extends { type: "array"; fields: infer Item extends Fields }
    ? ArrayValue<Collections, Item, Spec, Sel>
    : FieldType extends {
          type: "blocks";
          blocks: infer Blocks extends Record<string, { fields: Fields }>;
        }
      ? BlocksValue<Collections, Blocks, Spec, Sel>
      : FieldType extends { type: "relation" }
        ? RelationValue<Collections, FieldType, Spec, Sel>
        : FieldType extends { type: "image" | "file" }
          ? MediaFieldValue<FieldType, Spec>
          : FieldType extends { type: "join" }
            ? JoinValue<Collections, FieldType, Spec, Sel>
            : FieldType extends { type: "link" }
              ? Off<Spec> extends true
                ? LinkValue
                : LinkRead
              : FieldType extends Field
                ? FieldValue<FieldType>
                : never;

type OptionalReadFields<Collections, F extends Fields, Spec, Sel> = {
  [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: FieldReadValue<
    Collections,
    F[K],
    Sub<Spec, K>,
    SelAt<Sel, K>
  > | null;
};
type RequiredReadFields<Collections, F extends Fields, Spec, Sel> = {
  [K in Exclude<RequiredKey<F> | JoinKey<F>, UnpopulatedJoins<F, Spec>>]: FieldReadValue<
    Collections,
    F[K],
    Sub<Spec, K>,
    SelAt<Sel, K>
  >;
};

/**
 * Data of `F` as a read returns it. Unnamed joins are absent; named joins are required. `Sel` is the read's select
 * spec, which decides where a relation's own `select` applies.
 * It MUST NOT be wrapped in `Simplify`: a callback on a read result (`docs.map((doc) => …)`) makes TypeScript
 * instantiate the type again, and a `Simplify` at every level hits TS2589 below a group, array or blocks field.
 * The types that wrap it simplify instead.
 */
export type Resolve<Collections, F extends Fields, Spec, Sel = true> = OptionalReadFields<
  Collections,
  F,
  Spec,
  Sel
> &
  RequiredReadFields<Collections, F, Spec, Sel>;

/** An untyped schema (the admin's) reads plain records. The recursive types would not terminate. */
export type Wide<Collections> = string extends keyof Collections ? true : false;

/** Data of `F` as a read returns it, after `populate` and `select`. */
export type Read<Collections, F extends Fields, PopulateSpec, SelectSpec = true> =
  Wide<Collections> extends true
    ? Record<string, any>
    : Selected<Resolve<Collections, F, PopulateSpec, SelectSpec>, SelectSpec>;

/** `id` is always selected. Other metadata MUST be named in the select spec. */
type SelectedMeta<SelectSpec> = [SelectSpec] extends [true]
  ? Meta
  : Pick<Meta, "id" | Extract<keyof SelectSpec, keyof Meta>>;

/** A document as a read returns it: {@link Read} plus the selected metadata. `Extra` is more metadata, like the locale keys. */
export type ReadDoc<
  Collections,
  F extends Fields,
  PopulateSpec,
  SelectSpec = true,
  Extra = {},
> = Simplify<Read<Collections, F, PopulateSpec, SelectSpec> & SelectedMeta<SelectSpec> & Extra>;

/** `Value` with only `id` and the keys in `SelectSpec`. */
type SelectedObject<Value, SelectSpec> = Simplify<{
  [K in keyof Value as K extends "id" | keyof SelectSpec ? K : never]: K extends keyof SelectSpec
    ? Selected<Value[K], SelectSpec[K]>
    : Value[K];
}>;

/**
 * Whether `Item` is a block item that `SelectSpec` selects by block name: every item has an `id` and a literal
 * `blockType`, and every key of the spec is one of the block names.
 */
type SelectsBlocks<Item, SelectSpec> = [Item] extends [{ id: string; blockType: infer T }]
  ? string extends T
    ? false
    : [keyof SelectSpec] extends [T]
      ? true
      : false
  : false;

/** A block item with the spec of its block name: `true` keeps it, an object picks fields, none leaves `id` and `blockType`. */
type SelectedBlock<Item, SelectSpec> = Item extends { blockType: infer K }
  ? K extends keyof SelectSpec
    ? SelectSpec[K] extends true
      ? Item
      : Simplify<{ id: string; blockType: K } & SelectedObject<Item, SelectSpec[K]>>
    : { id: string; blockType: K }
  : never;

/** `Value` with only the selected keys at each object level. */
type Selected<Value, SelectSpec> = [SelectSpec] extends [true]
  ? Value
  : Value extends (infer Item)[]
    ? SelectsBlocks<Item, SelectSpec> extends true
      ? SelectedBlock<Item, SelectSpec>[]
      : Selected<Item, SelectSpec>[]
    : Value extends object
      ? string extends keyof Value
        ? Value
        : SelectedObject<Value, SelectSpec>
      : Value;
