# Access control: plan

Spec: `docs/superpowers/specs/2026-10-25-access-control-design.md`. TDD per step: a failing test in `src/tests/access.test.ts` (or a unit test next to the code), then the code.

1. **Plumbing.** `ForbiddenError` in `errors.ts`, mapped in `http/errors.ts`, expected in `run-operation.ts`. `Scope.overrideAccess`; `outerScope(user, perspective, overrideAccess)`; `inner()` builds a trusted `cms`. The default instance is trusted, `withSession()` and HTTP are not.
2. **`src/access/`.** `types.ts`, `rule.ts` (`decide()`, `enforce()`, `guard()`, `matches()`), `fields.ts` (`stripDenied()`, `dropDenied()`), `check-access.ts` (startup), `permissions.ts` (`/schema` overlay). Types on `Collection`, `Global`, `Common`, `MediaOptions`; the media entry gets `media.access`.
3. **Reads.** `read()` and `readGlobal()` decide `read`; `findDocs` takes an `access` filter. `hop()` in population and `resolveRichtext()` filter targets. `afterRead()` strips denied fields; `http/strip-private-fields.ts` and `http/visibility.ts` go. Media files and variants check the media read rule.
4. **Writes.** `write()` guards create/update and drops denied fields; `remove()` guards delete; discard and remove-locale guard update. Media upload, folder rename, regenerate and download check their rules.
5. **Ownership.** Migration `007_cms_authors`, the insert/update queries, `toDoc()`, `Meta`, `metaKeys()`, `findDocs` columns.
6. **HTTP.** Optional session for content writes; `/schema` overlay.
7. **Admin.** Menu, list, form, fields, media library; i18n.
8. **Docs and example.** Astro `author` role and `posts.access`, a field rule in `kitchenSink`, READMEs, CLAUDE.md, README, `todo.md`.

Verify: `pnpm test`, `pnpm typecheck`, `tsdown` d.ts build, `pnpm lint`, the Astro smoke test (author creates, cannot edit or delete an admin's post, anonymous `POST` is 401) and a look in Chrome.
