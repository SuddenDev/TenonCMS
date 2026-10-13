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

type CheckBlocks<B, C, Self extends string> = {
  [K in keyof B]: B[K] extends { fields: infer G }
    ? Replace<B[K], "fields", CheckFields<G, C, Self>>
    : B[K];
};

type CheckFields<F, C, Self extends string> = {
  [K in keyof F]: F[K] extends { type: "group" | "array"; fields: infer G }
    ? Replace<F[K], "fields", CheckFields<G, C, Self>>
    : F[K] extends { type: "blocks"; blocks: infer B }
      ? Replace<F[K], "blocks", CheckBlocks<B, C, Self>>
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
