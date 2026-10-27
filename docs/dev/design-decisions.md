# Design decisions

The choices that shape the rest of the code, and why.

## Data

- **One JSON documents table for all collections.** Schema changes need no migration. Filters read the JSON, and field names are checked against the schema before they reach SQL. SonicJS does the same.
- **Relation ids live in the document JSON.** A string, or a list of strings for `many`. Reverse lookups (joins, delete checks) scan the JSON. That is fine up to roughly 10k to 50k documents per collection, and indexes can come later without API changes.
- **Core owns only the fixed tables.** CMS migrations are hand-written code inside the bundle, so they run without a filesystem (Cloudflare later). better-auth creates its own tables from the real options, plugins included. All run lazily on first database use.
- **SQLite only, for now.** Through libsql (a file or Turso). D1 and Postgres come later behind the same document shape.
- **Our own small libsql dialect for Kysely.** better-auth's migrations only work with its Kysely adapter, and the off-the-shelf libsql dialect pulls an older client and a second native binary that the Nuxt build does not trace.

## Behavior

- **Validation, access rules and hooks live in the local API.** HTTP is a thin layer, so server code, HTTP and the admin behave the same. By default published reads are public, while drafts and writes need a user, because pages render the content anyway.
- **Writes run in one transaction** with their hooks, deletion effects and nested calls. Nested calls MUST go through the hook's `cms`.
- **Options the admin evaluates MUST be JSON.** Conditions, built-in checks and plain defaults run in both places. `validate`, function defaults and hooks run on the server only.
- **Presets are data, not features.** Page paths are stored and filtered like any field, with no special "find by path". The SEO title fallback is computed at render time and never stored.

## Structure

- **Instance-owned server state.** Everything server-side lives in the `defineCms()` closure, so several instances can coexist. The browser preview deliberately shares one store across its framework entries.
- **Lazy database and auth.** Nothing connects at import time, so public pages keep working with a bad config.
- **One published package.** Framework adapters are subpath exports with optional peer dependencies.
- **The admin path is an adapter option**, not part of the config. Routes are registered at build time, before the config can load.

## Admin

- **The admin is a compiled library the host bundles.** Core never imports it, so headless is free. Extensions are exports in the host's own modules, compiled by the host's Vite with HMR.
- **The extension contract is `mount(el, ctx)` only.** No framework components cross the boundary, so the admin bundles its own Vue and hosts install nothing. Data flows in through `ctx`, out through callbacks. New slots MUST use the same contract, and helpers go under `ctx.integral`.
