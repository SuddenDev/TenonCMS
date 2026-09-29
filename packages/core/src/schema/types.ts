import type { Field, Fields } from "./index.ts";

// Inference of stored data, compile-time relation checks and the read types. Nothing here runs.

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

// Stored data.

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

export type Data<F extends Fields> = {
  [K in Exclude<RequiredKey<F>, JoinKey<F>>]: FieldValue<F[K]>;
} & {
  [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: FieldValue<F[K]> | null;
};

type Meta = { id: string; createdAt: string; updatedAt: string };
export type Doc<F extends Fields> = Data<F> & Meta;

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

// Relation checks. An invalid `collection` or `on` is replaced by an `Invalid` type, so the error names the allowed values.

/** Dot paths of relation fields in `F` that point to `Target`, through groups. */
type RelationPaths<F, Target extends string, P extends string = ""> = {
  [K in keyof F & string]: F[K] extends { type: "group"; fields: infer G }
    ? RelationPaths<G, Target, `${P}${K}.`>
    : F[K] extends { type: "relation"; collection: Target }
      ? `${P}${K}`
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

/**
 * Checks every relation and join in `S` against the collections in `C`.
 * Resolves to `S` when all are valid. Use it as `S & NoInfer<CheckRefs<S, C>>`, so `S` is inferred from the argument alone.
 */
export type CheckRefs<S, C> = S extends { [K in keyof S]: { fields: unknown } }
  ? {
      [K in keyof S]: Replace<S[K], "fields", CheckFields<S[K]["fields"], C, K & string>>;
    } extends infer R
    ? S extends R
      ? S
      : R
    : never
  : S;

// The populate spec. `P` is `false` (ids), a number (hops left) or a populate object. `Sub` and `Next` are the
// type-level twins of `step()` in `populate.ts`.

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** What `P` says about key `K`. */
type Sub<P, K> = P extends number
  ? P
  : P extends object
    ? K extends keyof P
      ? P[K]
      : false
    : false;
/** The spec the documents under a resolved relation get. */
type Next<S> = S extends true ? false : S extends number ? Prev[S] : S;
/** Whether `S` resolves a relation at all. */
type Off<S> = S extends false | 0 | undefined ? true : false;
/** Join keys a read leaves out: every join, unless a populate object names it. */
type Joins<F, P> = {
  [K in keyof F]: F[K] extends { type: "join" }
    ? P extends object
      ? K extends keyof P
        ? never
        : K
      : K
    : never;
}[keyof F];

// Read results.

/** Documents of collection `C` with relations resolved as `P` says. */
type Target<Cs, C, P> = C extends keyof Cs
  ? Simplify<Resolve<Cs, FieldsOf<Cs, C>, P> & Meta>
  : never;
type Targets<Cs, C, P, F> = F extends { many: true } ? Target<Cs, C, P>[] : Target<Cs, C, P>;

/** The value of one field in a read, with spec `S`. */
type Value<Cs, F, S> = F extends { type: "group"; fields: infer G extends Fields }
  ? Resolve<Cs, G, S extends true ? 1 : S>
  : F extends { type: "relation"; collection: infer C }
    ? Off<S> extends true
      ? Ids<F>
      : Targets<Cs, C, Next<S>, F>
    : F extends { type: "image" | "file" }
      ? Off<S> extends true
        ? Ids<F>
        : MediaValue<F, F extends { type: "image" } ? Image : File>
      : F extends { type: "join"; collection: infer C }
        ? Target<Cs, C, Next<S>>[]
        : F extends Field
          ? FieldValue<F>
          : never;

/** Data of `fields` as a read returns it, with relations resolved as `P` says. Joins are required, unnamed joins absent. */
export type Resolve<Cs, F extends Fields, P> = Simplify<
  {
    [K in Exclude<keyof F, RequiredKey<F> | JoinKey<F>>]?: Value<Cs, F[K], Sub<P, K>> | null;
  } & {
    [K in Exclude<RequiredKey<F> | JoinKey<F>, Joins<F, P>>]: Value<Cs, F[K], Sub<P, K>>;
  }
>;

/** An untyped schema (the admin's) reads plain records. The recursive types would not terminate. */
type Wide<Cs> = string extends keyof Cs ? true : false;
export type Read<Cs, F extends Fields, P, S = true> =
  Wide<Cs> extends true ? Record<string, any> : Selected<Resolve<Cs, F, P>, S>;
// `createdAt` and `updatedAt` only when `S` lists them.
type SelectedMeta<S> = [S] extends [true] ? Meta : Pick<Meta, "id" | Extract<keyof S, keyof Meta>>;
export type ReadDoc<Cs, F extends Fields, P, S = true> = Simplify<
  Read<Cs, F, P, S> & SelectedMeta<S>
>;

/** `T` with only `id` and the keys of `S`. */
type SelectedObject<T, S> = Simplify<{
  [K in keyof T as K extends "id" | keyof S ? K : never]: K extends keyof S
    ? Selected<T[K], S[K]>
    : T[K];
}>;
/** `T` with only `id` and the keys of `S`, at every object level. Arrays and `null` pass through; so do plain records (an untyped schema). */
type Selected<T, S> = [S] extends [true]
  ? T
  : T extends (infer U)[]
    ? Selected<U, S>[]
    : T extends object
      ? string extends keyof T
        ? T
        : SelectedObject<T, S>
      : T;

// Read options.

/** The populate spec of an options literal: `populate: false`, a populate object, `depth`, or the default `D`. */
export type PopulateOf<O, D extends number> = O extends { populate: false }
  ? false
  : O extends { populate: infer P extends object }
    ? P
    : O extends { depth: infer N extends number }
      ? N
      : D;
export type SelectOf<O> = O extends { select: infer S extends object } ? S : true;

/** Paths a `populate` object may name: groups, relations and joins, nested along their targets. Images and files are leaves. */
export type Populate<Cs, F extends Fields> = {
  [K in Keys<F, { type: "group" | "relation" | "join" | "image" | "file" }>]?: F[K] extends {
    type: "group";
    fields: infer G extends Fields;
  }
    ? true | Populate<Cs, G>
    : F[K] extends { collection: infer C }
      ? true | Populate<Cs, FieldsOf<Cs, C>>
      : true;
};
export type PopulateArg<Cs, F extends Fields> =
  Wide<Cs> extends true ? Record<string, unknown> : Populate<Cs, F>;

type SelectGroup<Cs, G extends Fields, S> = true | Select<Cs, G, S extends true ? 1 : S, false>;
// Into a relation only when `S` resolves it.
type SelectRelation<Cs, C, S> =
  Off<S> extends true ? true : true | Select<Cs, FieldsOf<Cs, C>, Next<S>>;
// Into a join only when a populate object names it, or under the wide `number` P of the `ReadOptions` constraint.
type SelectJoin<Cs, C, P, K, S> = P extends object
  ? K extends keyof P
    ? true | Select<Cs, FieldsOf<Cs, C>, Next<S>>
    : true
  : number extends P
    ? true | Select<Cs, FieldsOf<Cs, C>, Next<S>>
    : true;

/**
 * Keys a `select` object may name: fields, and on a document (`Doc`) `id`, `createdAt` and `updatedAt`.
 * An object is allowed under a group, and under a relation or join that `P` resolves.
 */
export type Select<Cs, F extends Fields, P, Doc extends boolean = true> = {
  [K in keyof F]?: F[K] extends { type: "group"; fields: infer G extends Fields }
    ? SelectGroup<Cs, G, Sub<P, K>>
    : F[K] extends { type: "relation"; collection: infer C }
      ? SelectRelation<Cs, C, Sub<P, K>>
      : F[K] extends { type: "join"; collection: infer C }
        ? SelectJoin<Cs, C, P, K, Sub<P, K>>
        : true;
} & (Doc extends true ? { id?: true; createdAt?: true; updatedAt?: true } : {});
export type SelectArg<Cs, F extends Fields, P, Doc extends boolean = true> =
  Wide<Cs> extends true ? Record<string, any> : Select<Cs, F, P, Doc>;

// Generic inference skips excess property checks, so extra keys map to `never` at every level.
// An object under a key that allows only `true` maps to `never`; without that rule `keyof never` accepts every key.
export type Exact<P, A> = P extends object
  ? [A] extends [never]
    ? never
    : { [K in keyof P]: K extends keyof A ? Exact<P[K], Exclude<A[K], true | undefined>> : never }
  : P;

/** Read options of `find`, `findOne`, `findById` and `getGlobal`. `Doc` is `false` for globals, which have no `id`, `createdAt` or `updatedAt`. */
export type ReadOptions<Cs, F extends Fields, Doc extends boolean = true> = {
  /** `false` returns ids. An object resolves only the listed paths, `true` one hop. Default: every relation up to `depth`. */
  populate?: boolean | PopulateArg<Cs, F>;
  /** Hops resolved when `populate` is not an object. */
  depth?: number;
  /**
   * The fields a read returns. `id` always comes back; `createdAt` and `updatedAt` only when listed. `true` keeps a value as
   * `populate` leaves it: an id, ids, a document or documents. An object lists the keys inside a group, or inside a relation or
   * join that `populate` resolves. `{}` returns only `id`. Hooks see the full documents; `afterOperation` sees the result.
   * Default: every field.
   */
  select?: SelectArg<Cs, F, number, Doc>;
};
/** Checks the `populate` and `select` literals in `O` against the fields at every level. `D` is the default depth. */
export type Checked<
  O extends ReadOptions<Cs, F, Doc>,
  Cs,
  F extends Fields,
  D extends number = 2,
  Doc extends boolean = true,
> = O & {
  populate?: Exact<O["populate"], PopulateArg<Cs, F>>;
  select?: Exact<O["select"], SelectArg<Cs, F, PopulateOf<O, D>, Doc>>;
};
