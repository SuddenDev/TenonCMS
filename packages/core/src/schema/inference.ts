import type { Field, Fields } from "./index.ts";

// Inference of stored data, compile-time relation checks and read types. Nothing here runs.

/* ── Shared type helpers ──────────────────────────────────────────────────────────────── */

type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** `T` with property `K` replaced by `V`. */
type Replace<T, K extends PropertyKey, V> = { [P in keyof T]: P extends K ? V : T[P] };
/** The keys of `F` whose field matches `Match`. */
type Keys<F, Match> = { [K in keyof F]: F[K] extends Match ? K : never }[keyof F];
type FieldsOf<Cs, C> = C extends keyof Cs
  ? Cs[C] extends { fields: infer F extends Fields }
    ? F
    : never
  : never;

/* ── Stored values and documents ──────────────────────────────────────────────────────── */

type Scalar = {
  text: string;
  textarea: string;
  date: string;
  slug: string;
  number: number;
  boolean: boolean;
};
type Ids<F> = F extends { many: true } ? string[] : string;

type FieldValue<F extends Field> = F extends { type: "group"; fields: infer G extends Fields }
  ? Data<G>
  : F extends { type: "select"; options: readonly (infer O)[] }
    ? O
    : F extends { type: "relation" | "image" | "file" }
      ? Ids<F>
      : F extends { type: keyof Scalar }
        ? Scalar[F["type"]]
        : string;

type JoinKey<F> = Keys<F, { type: "join" }>;
type RequiredKey<F> = Keys<F, { required: true }>;

type RequiredData<F extends Fields> = {
  [K in Exclude<RequiredKey<F>, JoinKey<F>>]: FieldValue<F[K]>;
};
type OptionalData<F extends Fields> = {
  [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: FieldValue<F[K]> | null;
};

export type Data<F extends Fields> = RequiredData<F> & OptionalData<F>;

/* ── Read metadata and populated media ───────────────────────────────────────────────── */

type Meta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** When the document was last published. `null`: never published. */
  publishedAt: string | null;
  /** Whether a draft is pending. */
  hasDraft: boolean;
};
export type Doc<F extends Fields> = Data<F> & Meta;
/** The meta of a global read. A `select` leaves it out. */
export type GlobalMeta<S = true> = [S] extends [true] ? Pick<Meta, "publishedAt" | "hasDraft"> : {};

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

// A populated `image` or `file`, or several with `many`.
type MediaValue<F, T> = F extends { many: true } ? T[] : T;

/** Field keys that `where` accepts. Groups, joins and `many` relations are not filterable. */
export type FilterKey<F extends Fields> = Exclude<
  keyof F,
  Keys<F, { type: "group" | "join" } | { many: true }>
>;

/* ── Relation validation ──────────────────────────────────────────────────────────────── */

/** Dot paths of relation fields in `F` that point to `Target`, through groups. */
type RelationPaths<F, Target extends string, Prefix extends string = ""> = {
  [K in keyof F & string]: F[K] extends { type: "group"; fields: infer G }
    ? RelationPaths<G, Target, `${Prefix}${K}.`>
    : F[K] extends { type: "relation"; collection: Target }
      ? `${Prefix}${K}`
      : never;
}[keyof F & string];

/** An error type. No value matches it, so the type error shows `message` and the values `use` allows. */
type Invalid<M extends string, U = never> = { message: M; use: U };

/** The error for an invalid join `on`, with the relation paths it may use. */
type JoinError<F, N extends string, Self extends string> = [RelationPaths<F, Self>] extends [never]
  ? Invalid<`no relation in '${N}' points to '${Self}'`>
  : Invalid<`not a relation in '${N}' that points to '${Self}'`, RelationPaths<F, Self>>;

// A relation or join whose `collection` is not in `C`. Widened `string` values are not checked; only literals can be.
type CheckTarget<F, C> = F extends { collection: infer N }
  ? string extends N
    ? F
    : N extends keyof C
      ? F
      : Replace<F, "collection", Invalid<`'${N & string}' is not a collection`, keyof C & string>>
  : F;

// A join whose `on` is not a relation to `Self` in its collection.
type CheckOn<F, C, Self extends string> = F extends {
  type: "join";
  collection: infer N extends keyof C;
  on: infer O;
}
  ? string extends O
    ? F
    : O extends RelationPaths<FieldsOf<C, N>, Self>
      ? F
      : Replace<F, "on", JoinError<FieldsOf<C, N>, N & string, Self>>
  : F;

type CheckFields<F, C, Self extends string> = {
  [K in keyof F]: F[K] extends { type: "group"; fields: infer G }
    ? Replace<F[K], "fields", CheckFields<G, C, Self>>
    : F[K] extends { type: "relation" | "join" }
      ? CheckOn<CheckTarget<F[K], C>, C, Self>
      : F[K];
};

type CheckCollections<S, C> = {
  [K in keyof S]: S[K] extends { fields: infer F }
    ? Replace<S[K], "fields", CheckFields<F, C, K & string>>
    : S[K];
};

/**
 * Checks every relation and join in `S` against the collections in `C`.
 * Resolves to `S` when all are valid. Use it as `S & NoInfer<CheckRefs<S, C>>`, so `S` is inferred from the argument alone.
 */
export type CheckRefs<S, C> = S extends { [K in keyof S]: { fields: unknown } }
  ? CheckCollections<S, C> extends infer R
    ? S extends R
      ? S
      : R
    : never
  : S;

/* ── Populate traversal rules ────────────────────────────────────────────────────────── */

// The spec is `false` (ids), a number (hops left), or an object. `Sub` and `Next` are the
// type-level twins of `step()` in `populate.ts`.

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** The populate spec for `Key`. */
type Sub<Spec, Key> = Spec extends number
  ? Spec
  : Spec extends object
    ? Key extends keyof Spec
      ? Spec[Key]
      : false
    : false;
/** The spec the documents under a resolved relation get. */
type Next<Spec> = Spec extends true ? false : Spec extends number ? Prev[Spec] : Spec;
/** Whether `Spec` resolves a relation. */
type Off<Spec> = Spec extends false | 0 | undefined ? true : false;
/** Join keys a read leaves out: every join, unless a populate object names it. */
type UnpopulatedJoins<F, Spec> = Exclude<JoinKey<F>, Spec extends object ? keyof Spec : never>;

/* ── Read result types ───────────────────────────────────────────────────────────────── */

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

/** Data of `F` as a read returns it. Unnamed joins are absent; named joins are required. */
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

export type Resolve<Collections, F extends Fields, Spec> = Simplify<
  OptionalReadFields<Collections, F, Spec> & RequiredReadFields<Collections, F, Spec>
>;

/** An untyped schema (the admin's) reads plain records. The recursive types would not terminate. */
type Wide<Collections> = string extends keyof Collections ? true : false;
export type Read<Collections, F extends Fields, PopulateSpec, SelectSpec = true> =
  Wide<Collections> extends true
    ? Record<string, any>
    : Selected<Resolve<Collections, F, PopulateSpec>, SelectSpec>;
// `id` is always selected. Other metadata must be named in the select spec.
type SelectedMeta<SelectSpec> = [SelectSpec] extends [true]
  ? Meta
  : Pick<Meta, "id" | Extract<keyof SelectSpec, keyof Meta>>;
export type ReadDoc<Collections, F extends Fields, PopulateSpec, SelectSpec = true> = Simplify<
  Read<Collections, F, PopulateSpec, SelectSpec> & SelectedMeta<SelectSpec>
>;

/* ── Selection projection ─────────────────────────────────────────────────────────────── */

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

/* ── Populate and select option types ────────────────────────────────────────────────── */

/** The populate spec of `Options`: `populate: false`, a populate object, `depth`, or the default depth. */
export type PopulateOf<Options, DefaultDepth extends number> = Options extends {
  populate: false;
}
  ? false
  : Options extends { populate: infer Spec extends object }
    ? Spec
    : Options extends { depth: infer Depth extends number }
      ? Depth
      : DefaultDepth;
export type SelectOf<Options> = Options extends { select: infer Spec extends object } ? Spec : true;

/** Paths a `populate` object may name: groups, relations and joins, nested along their targets. Images and files are leaves. */
type PopulateField<Collections, FieldType> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? true | Populate<Collections, Group>
  : FieldType extends { collection: infer Collection }
    ? true | Populate<Collections, FieldsOf<Collections, Collection>>
    : true;
export type Populate<Collections, F extends Fields> = {
  [K in Keys<F, { type: "group" | "relation" | "join" | "image" | "file" }>]?: PopulateField<
    Collections,
    F[K]
  >;
};
export type PopulateArg<Collections, F extends Fields> =
  Wide<Collections> extends true ? Record<string, unknown> : Populate<Collections, F>;

type SelectGroup<Collections, Group extends Fields, Spec> =
  | true
  | Select<Collections, Group, Spec extends true ? 1 : Spec, false>;
type SelectRelation<Collections, Collection, Spec> =
  Off<Spec> extends true
    ? true
    : true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>;
type SelectJoin<Collections, Collection, PopulateSpec, Key, Spec> = PopulateSpec extends object
  ? Key extends keyof PopulateSpec
    ? true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>
    : true
  : number extends PopulateSpec
    ? true | Select<Collections, FieldsOf<Collections, Collection>, Next<Spec>>
    : true;

type SelectField<Collections, FieldType, PopulateSpec, Key> = FieldType extends {
  type: "group";
  fields: infer Group extends Fields;
}
  ? SelectGroup<Collections, Group, Sub<PopulateSpec, Key>>
  : FieldType extends { type: "relation"; collection: infer Collection }
    ? SelectRelation<Collections, Collection, Sub<PopulateSpec, Key>>
    : FieldType extends { type: "join"; collection: infer Collection }
      ? SelectJoin<Collections, Collection, PopulateSpec, Key, Sub<PopulateSpec, Key>>
      : true;

/**
 * Keys a `select` object may name: fields, and on a document the meta keys.
 * Nested keys are allowed under groups and populated relations or joins.
 */
export type Select<Collections, F extends Fields, PopulateSpec, Document extends boolean = true> = {
  [K in keyof F]?: SelectField<Collections, F[K], PopulateSpec, K>;
} & (Document extends true
  ? { id?: true; createdAt?: true; updatedAt?: true; publishedAt?: true; hasDraft?: true }
  : {});
export type SelectArg<
  Collections,
  F extends Fields,
  PopulateSpec,
  Document extends boolean = true,
> =
  Wide<Collections> extends true
    ? Record<string, any>
    : Select<Collections, F, PopulateSpec, Document>;

/* ── Read option validation ───────────────────────────────────────────────────────────── */

// Generic inference skips excess property checks, so extra keys map to `never` at every level.
// An object under a key that allows only `true` maps to `never`; without that rule `keyof never` accepts every key.
export type Exact<Provided, Allowed> = Provided extends object
  ? [Allowed] extends [never]
    ? never
    : {
        [K in keyof Provided]: K extends keyof Allowed
          ? Exact<Provided[K], Exclude<Allowed[K], true | undefined>>
          : never;
      }
  : Provided;

/** Read options of `find`, `findOne`, `findById` and `getGlobal`. Globals have no `id`, `createdAt` or `updatedAt`. */
export type ReadOptions<Collections, F extends Fields, Document extends boolean = true> = {
  /** `false` returns ids. An object resolves only the listed paths, `true` one hop. Default: every relation up to `depth`. */
  populate?: boolean | PopulateArg<Collections, F>;
  /** Hops resolved when `populate` is not an object. */
  depth?: number;
  /**
   * The fields a read returns. `id` always comes back; the other meta keys only when listed. `true` keeps a value as
   * `populate` leaves it: an id, ids, a document or documents. An object lists the keys inside a group, or inside a relation or
   * join that `populate` resolves. `{}` returns only `id`. Hooks see the full documents; `afterOperation` sees the result.
   * Default: every field.
   */
  select?: SelectArg<Collections, F, number, Document>;
};
/** Checks the `populate` and `select` literals at every level. */
export type Checked<
  Options extends ReadOptions<Collections, F, Document>,
  Collections,
  F extends Fields,
  DefaultDepth extends number = 2,
  Document extends boolean = true,
> = Options & {
  populate?: Exact<Options["populate"], PopulateArg<Collections, F>>;
  select?: Exact<
    Options["select"],
    SelectArg<Collections, F, PopulateOf<Options, DefaultDepth>, Document>
  >;
};
