import type { Field, Fields } from "../fields/index.ts";
import type { FieldsOf, Simplify } from "./common.ts";
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

/** Join keys a read leaves out: every join, unless a populate object names it. */
type UnpopulatedJoins<F, Spec> = Exclude<JoinKey<F>, Spec extends object ? keyof Spec : never>;

/** Documents of `Collection` with relations resolved as `Spec` says. */
type Target<Collections, Collection, Spec> = Collection extends keyof Collections
  ? Simplify<Resolve<Collections, FieldsOf<Collections, Collection>, Spec> & Meta>
  : never;
type Targets<Collections, Collection, Spec, Relation> = Relation extends { many: true }
  ? Target<Collections, Collection, Spec>[]
  : Target<Collections, Collection, Spec>;

type GroupValue<Collections, Group extends Fields, Spec> = Resolve<
  Collections,
  Group,
  Spec extends true ? 1 : Spec
>;
type RelationValue<Collections, Relation, Spec> = Relation extends {
  collection: infer Collection;
}
  ? Off<Spec> extends true
    ? Ids<Relation>
    : Targets<Collections, Collection, Next<Spec>, Relation>
  : never;
type MediaFieldValue<MediaField, Spec> =
  Off<Spec> extends true
    ? Ids<MediaField>
    : MediaValue<MediaField, MediaField extends { type: "image" } ? Image : File>;
type JoinValue<Collections, Join, Spec> = Join extends { collection: infer Collection }
  ? Target<Collections, Collection, Next<Spec>>[]
  : never;

/** The value of one field in a read, using the populate spec for that field. */
type FieldReadValue<Collections, FieldType, Spec> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? GroupValue<Collections, Group, Spec>
  : FieldType extends { type: "relation" }
    ? RelationValue<Collections, FieldType, Spec>
    : FieldType extends { type: "image" | "file" }
      ? MediaFieldValue<FieldType, Spec>
      : FieldType extends { type: "join" }
        ? JoinValue<Collections, FieldType, Spec>
        : FieldType extends Field
          ? FieldValue<FieldType>
          : never;

type OptionalReadFields<Collections, F extends Fields, Spec> = {
  [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: FieldReadValue<
    Collections,
    F[K],
    Sub<Spec, K>
  > | null;
};
type RequiredReadFields<Collections, F extends Fields, Spec> = {
  [K in Exclude<RequiredKey<F> | JoinKey<F>, UnpopulatedJoins<F, Spec>>]: FieldReadValue<
    Collections,
    F[K],
    Sub<Spec, K>
  >;
};

/** Data of `F` as a read returns it. Unnamed joins are absent; named joins are required. */
export type Resolve<Collections, F extends Fields, Spec> = Simplify<
  OptionalReadFields<Collections, F, Spec> & RequiredReadFields<Collections, F, Spec>
>;

/** An untyped schema (the admin's) reads plain records. The recursive types would not terminate. */
export type Wide<Collections> = string extends keyof Collections ? true : false;

/** Data of `F` as a read returns it, after `populate` and `select`. */
export type Read<Collections, F extends Fields, PopulateSpec, SelectSpec = true> =
  Wide<Collections> extends true
    ? Record<string, any>
    : Selected<Resolve<Collections, F, PopulateSpec>, SelectSpec>;

/** `id` is always selected. Other metadata MUST be named in the select spec. */
type SelectedMeta<SelectSpec> = [SelectSpec] extends [true]
  ? Meta
  : Pick<Meta, "id" | Extract<keyof SelectSpec, keyof Meta>>;

/** A document as a read returns it: {@link Read} plus the selected metadata. */
export type ReadDoc<Collections, F extends Fields, PopulateSpec, SelectSpec = true> = Simplify<
  Read<Collections, F, PopulateSpec, SelectSpec> & SelectedMeta<SelectSpec>
>;

/** `Value` with only `id` and the keys in `SelectSpec`. */
type SelectedObject<Value, SelectSpec> = Simplify<{
  [K in keyof Value as K extends "id" | keyof SelectSpec ? K : never]: K extends keyof SelectSpec
    ? Selected<Value[K], SelectSpec[K]>
    : Value[K];
}>;

/** `Value` with only the selected keys at each object level. */
type Selected<Value, SelectSpec> = [SelectSpec] extends [true]
  ? Value
  : Value extends (infer Item)[]
    ? Selected<Item, SelectSpec>[]
    : Value extends object
      ? string extends keyof Value
        ? Value
        : SelectedObject<Value, SelectSpec>
      : Value;
