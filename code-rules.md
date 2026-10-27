# Code rules

- Make a behavior easy to follow from its entry point to its effects.
- Keep related code together. Split by responsibility, not by line count.
- Names say intent, types say shape, tests prove behavior, comments state contracts.

These rules guide new changes, mostly in `packages/core`. They do not ask for a repo-wide rename. Compatibility, security and repository rules still apply. They draw on a review of [Ohne](https://github.com/ohnejs/ohnejs/tree/b78f3ad328b35ce965ec71764df1e82e7ffe48f7/src/ohne) and on the existing architecture.

`MUST` marks a correctness or compatibility rule. `SHOULD` marks a default with justified exceptions. File length and export count are review signals, not limits.

## 1. Put behavior with its owner

- An endpoint translates HTTP. The operation enforces rules that also hold for local calls. A query does persistence. Correctness MUST NOT depend on entering through HTTP.
- Put shared behavior with the invariant it protects: write stages in `content`, field traversal in `schema`, scoped transactions in the CMS runtime.
- Search for the existing owner before you add a helper. Do not create a second version of validation, traversal, locale resolution or hook ordering.
- Internal code SHOULD import the owning leaf file, not the package root. Public barrels list deliberate contracts and run no hidden initialization.
- A wrapper that binds a scope or checks eligibility earns its place. A pure forwarding layer does not.

```text
HTTP endpoint -> scoped local API -> feature operation -> shared content stages -> queries
Server call ---> scoped local API ---------^
```

## 2. Split files by responsibility

- One main responsibility per file, usually one or two exports. Keep its private helpers nearby.
- Extract a file when it has a distinct concept, independent callers, a testable contract, or a browser/server boundary.
- Keep a helper private when it only explains one step. Do not export it just for a test.
- Watch for both extremes. If one change needs many tiny files open, consolidate them.
- Add a folder only for a real family of responsibilities. No `services`, `managers` or `helpers` folders for hypothetical growth. A small module can stay flat.

## 3. Name for the reader at the call site

- Use the domain words: collection, global, document, field, draft, published perspective, scope, locale.
- File names are kebab-case with a role suffix: `create.endpoint.ts`, `create.operation.ts`, `create.local.ts`, `load-document.query.ts`.
- A function used across files carries its meaning without the import path: `runOperation`, `writeDocument`. Not `run`, `write`, `col`, `q`.
- Short local names are fine in a small scope (`i`, `T`, `c`).
- Booleans read as conditions: `isDraft`, `hasVariants`, `canWrite`. A name starting with `is` or `can` answers yes or no. A helper that throws says so (`require…`).
- Use an options object when adjacent booleans or many arguments are hard to tell apart. Not for a plain two-argument call.
- Do not rename a public export for style without a compatibility plan.

## 4. Show the order of execution

- A coordinating function reads as the real sequence of decisions and effects. Its helpers stay at one conceptual level.
- Use early returns for invalid or finished cases. Prefer a loop over a chain that mixes mutation, filtering and async work.
- Put the main function near the top, private details below.
- Separate phases with a blank line: resolve context, check access, load state, prepare input, persist, run effects. No banners. No comments that repeat the next call.
- Avoid boolean puzzles, nested ternaries and long positional calls. Name an intermediate value instead. Do not pass one context object holding the whole system.
- Extract a helper only if a caller understands it from its name.

## 5. Let tools format

- Use the configured oxfmt, and Prettier for `.astro`. Format only the files you change.
- Keep type-only imports apart from runtime imports. Keep side-effect imports in order. Configure grouping rather than sorting by hand.
- Use blank lines between steps. No column alignment. Use braces for nested or multiline flow. A short one-line guard can stay compact.

## 6. Use types for contracts

- Public and module boundaries show inputs, outputs, absence and errors. Add explicit return types there, unless the inferred type carries needed literal or generic information.
- Take untrusted data as `unknown` and validate it. Do not cast instead. Keep unavoidable `any` and assertions at the boundary, with the reason.
- Keep complex inference in focused type modules, with positive and negative type tests. Name intermediate conditional types. Do not simplify recursive types at the cost of inference or the declaration build.
- Keep a type beside its owner unless it is truly shared.
- Type-only imports MUST stay type-only where browser/server separation relies on them.

## 7. Comments and JSDoc

- Public APIs SHOULD have JSDoc. An internal export needs it when ordering, mutation, defaults, absence or errors are not obvious. Private helpers need none.
- Start with one plain sentence. Then add only what matters: what mutates, what a missing result means, which transaction is used, which stages are skipped.
- Use `@param` for a surprising constraint, `@returns` and `@throws` for result and error meaning, `@example` when showing is easier than telling.
- Put comments above the code. Short sentences. RFC 2119 keywords for obligations.
- No end-of-line comments, commented-out code, or change history ("added", "now handles").
- One source of truth: JSDoc for the call, the module README for ownership and flow, tests for examples and edge cases. Update them together.

Good JSDoc states a rule the signature cannot, such as this security-relevant absence:

```ts
/**
 * Finds an unexpired upload owned by the scope's user.
 * @returns The upload row, or `undefined` for an unknown, expired or foreign upload.
 */
```

## 8. Tests

- Pure behavior gets a neighboring `<file>.test.ts`. Related type assertions can share one inference suite. HTTP and multi-module behavior goes in `packages/core/src/tests/`.
- Name a test for the behavior and the condition. Assert returned data, stored state and errors, not call order, unless order is the contract.
- A bug fix MUST start with a test that fails for the right reason. Cover empty, invalid, unauthorized and rollback cases. Type tests MUST also prove rejection.
- Split an integration suite by behavior when it gets hard to navigate. Keep fixtures small and share only setup that repeats.
- Adapter changes need the [smoke tests](docs/dev/smoke-tests.md). Core unit tests do not prove an adapter.

## 9. Keep safety and side effects visible

- Validate and check access at the real trust boundary. Error messages name the field or option and what failed, without private data.
- Keep transaction membership, hook order and cleanup. Nested writes MUST use their bound API. Files, network and email do not roll back with the database.
- Keep constraints next to the code they guard: null-prototype query trees, parameterized user values, browser-safe imports, immutable migrations, storage compensation.
- Reuse platform and dependency behavior. Do not build a second validation framework, transaction service or error hierarchy.

## 10. Keep navigation cheap

- A substantial module SHOULD have a short README: purpose, boundaries, starting points, invariants. Link to source. Do not retell every function.
- Keep the request traces in the core overview accurate (create, read and populate, upload completion, preview resolution).
- A refactor MUST update callers, exports, tests and docs. Keep public import paths and shipped migrations. Do not mix a behavior change with unrelated cleanup.
- Run the smallest checks that prove the change, plus `pnpm typecheck` (`pnpm -r typecheck` while a dev watcher runs). Run the declaration build when public inference changes.

A review asks four questions:

1. Can I find where this behavior lives?
2. Can I follow the call without opening every helper?
3. Can I see its effects and how it fails?
4. Can I find the test that protects it?
