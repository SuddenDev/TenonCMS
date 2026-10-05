---
name: module-refactor
description: Refactor and document one source module folder for readability without changing behavior - JSDoc on exports, grouped steps, private helpers, clear names, and a module README. Use when asked to clean up, restructure, proofread or document a folder such as packages/core/src/<module>/.
---

# Module refactor

Make one module folder easy to read without changing what it does. Work one folder at a time. The reference is `packages/core/src/content/`, and `content/writes/write-document.ts` is the model for a complex function.

## 1. Read, evaluate, then ask

Read every non-test file in the folder before you edit. Find the parts that are hard to read, poorly documented, or have unclear names. Base this on the rules for code that are established below.
Draft suggested changes and give a rationale for the changes. The draft should be kept concise. Then the user can intervene or approve them before implementation. Ask questions if anything is unclear.

## 2. Rules for code

**JSDoc on every export.** Write one or two short sentences, then `@params`(if it is more client side and not just core side), `@returns` (or `@throws` for checks that return nothing). List parameters only when a caller would get them wrong. The JSDoc MUST sit directly above the function; any other comment goes above the JSDoc, or the JSDoc detaches.

```ts
/**
 * Checks every `unique` top-level field against the published documents of the collection.
 * @throws {ValidationError} With every field whose value is already used.
 */
export async function checkUnique(…) {
```

**Function declarations for exports**, not arrow constants. Arrows stay fine for small local closures.

**Blank lines group steps.** One blank line between logical groups: load, check, transform, store, return. Use separator comments rarely; ideally the grouping is enough.

**A complex function reads as its steps.** The exported function shows the order; private helpers in the same file hold the details. A short comment above a step says why, not what.

```ts
export async function write(core, s, name, operation, input, options = {}) {
  const { id, effect, draft = false, publish = false } = options;
  const { fields } = target(core, name);
  const db = await q(core, s);

  // Draft writes and publishes merge over the draft. Other writes merge over published data.
  const source = await loadSource(db, name, id, draft || publish);
  if (id && !source) return undefined;

  // Prepare data and store either as a draft or as a published document
  const data = await prepareData(…);
  if (draft) return storeDraft(…);
  return storeDocument(…);
}
```

Good examples are:

- `onDelete()` in `content/integrity/apply-on-delete.ts` reads as "find, block, clear, cascade".
- The scaffolding, code quality, patterns and structure of `core/src/cms/create-cms.ts`.

- When several helpers share many parameters, pass one small context object (`Hop` in `populate.ts`).
- When the formatter wraps a call over several lines, name the argument first (`const cleared = …; await clear(cleared, id, effects);`).
- Move a helper into its own file only when another file needs it, or when the file mixes two responsibilities. Do not add forwarding layers.

**Names say what the thing is.**

- Avoid `utils`, `helpers` or `misc` as a file name when a precise name exists.
- Avoid names that clash with tool conventions, for example `*-spec.ts` next to `*.spec.ts` tests.
- Rename the file, type, functions and variables together (`population-spec.ts` / `Spec` / `toSpec()` became `populate-plan.ts` / `PopulatePlan` / `toPopulatePlan()`). Then grep for the old names in source, tests, READMEs and `CLAUDE.md` / `AGENTS.md`.
- Use `git mv`, so the history follows the file.

**Folders follow the flow, not the mechanism.** Group code by the pipeline it belongs to (`reads/`, `writes/`, `integrity/`), not by what it calls (`hooks/`). A hook call is one step in a pipeline and belongs next to its neighbours. Code that several sibling pipelines share goes into a shared folder (`lifecycle/`), so one pipeline never imports from another.

**Regular Comment** Should only be 1-2 lines, used for internal explanations, group anchors, or clarifications, not for documenting exports.

**Existing comments:** turn `//` comments that describe an export into JSDoc

**Arrow exports:** turn complex arrow exports `export const f = () => …` that are >50 lines into `function` declarations, but keep small local closures as arrow functions.

## 3. Module README

Every module folder has a `README.md` in this shape (see `collections/README.md` and `content/README.md`):

```md
# <Module>

What the module does, what it does not do, and links to the modules it depends on.

## Follow a <create | read | …>

`<entry point>` flows through:

`a.ts` → `b.ts` → `c.ts`

One paragraph on what each step is responsible for.

## Files

| Path      | Responsibility      |
| --------- | ------------------- |
| `folder/` | One line per entry. |

Closing notes: defaults, rules a reader MUST know, and design choices the code cannot show.
```

Keep it short and current. Name the real files and functions, and update the table whenever a file moves or is renamed.

## 4. Writing style

- Short sentences in simple language.
- Use RFC 2119 keywords (MUST, SHOULD, MAY) for obligations.
- Comments sit above the code, never at the end of a line, and describe the code as it is: no "now", "added" or "changed".

## 5. Verify

Run, from the repo root:

1. `pnpm fmt` (or oxfmt on the touched folder, and Prettier on the Markdown).
2. `pnpm lint`.
3. `pnpm typecheck` (or `pnpm -r typecheck` while a dev watcher runs).
4. `pnpm test`.

Behavior MUST NOT change, so every existing test passes without edits, apart from renamed imports. Do not commit; report what changed, what was left out and why.
