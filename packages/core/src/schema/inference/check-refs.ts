import type { FieldsOf, Replace } from "./common.ts";

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

/** A relation or join whose `collection` is not in `C`. Widened `string` values are not checked; only literals can be. */
type CheckTarget<F, C> = F extends { collection: infer N }
  ? string extends N
    ? F
    : N extends keyof C
      ? F
      : Replace<F, "collection", Invalid<`'${N & string}' is not a collection`, keyof C & string>>
  : F;

/** A join whose `on` is not a relation to `Self` in its collection. */
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

/** A block name that is not in the shared blocks `SB`. Widened `string` values are not checked. */
type CheckName<N, SB> = N extends string
  ? string extends N
    ? N
    : N extends keyof SB
      ? N
      : Invalid<`'${N}' is not a shared block`, keyof SB & string>
  : N;

// A list of names keeps its tuple shape, so the error points at the unknown name.
type CheckBlocks<B, C, Self extends string, SB> = B extends readonly unknown[]
  ? { [I in keyof B]: CheckName<B[I], SB> }
  : {
      [K in keyof B]: B[K] extends { fields: infer G }
        ? Replace<B[K], "fields", CheckFields<G, C, Self, SB>>
        : CheckName<B[K], SB>;
    };

type CheckFields<F, C, Self extends string, SB> = {
  [K in keyof F]: F[K] extends { type: "group" | "array"; fields: infer G }
    ? Replace<F[K], "fields", CheckFields<G, C, Self, SB>>
    : F[K] extends { type: "blocks"; blocks: infer B }
      ? Replace<F[K], "blocks", CheckBlocks<B, C, Self, SB>>
      : F[K] extends { type: "relation" | "join" }
        ? CheckOn<CheckTarget<F[K], C>, C, Self>
        : F[K];
};

// A join MUST point back to its collection. A shared block has no collection, so `Owned` is false there.
type CheckOwners<S, C, SB, Owned extends boolean> = {
  [K in keyof S]: S[K] extends { fields: infer F }
    ? Replace<S[K], "fields", CheckFields<F, C, Owned extends true ? K & string : never, SB>>
    : S[K];
};

/** `S` when it extends the checked `R`, else `R`, so the type error shows only what is wrong. */
type Checked<S, R> = S extends R ? S : R;

/**
 * Checks every relation and join in `S` against the collections in `C`, and every block name against the shared blocks
 * `SB`. Resolves to `S` when all are valid. Use it as `S & NoInfer<CheckRefs<S, C, SB>>`, so `S` is inferred from the
 * argument alone.
 */
export type CheckRefs<S, C, SB = {}> = S extends { [K in keyof S]: { fields: unknown } }
  ? Checked<S, CheckOwners<S, C, SB, true>>
  : S;

/** Like `CheckRefs`, for the shared blocks `SB`. Their relations have no owner, so a join in them never checks. */
export type CheckSharedBlocks<SB, C> = SB extends { [K in keyof SB]: { fields: unknown } }
  ? Checked<SB, CheckOwners<SB, C, SB, false>>
  : SB;
