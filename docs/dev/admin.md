# Admin

Two parts: the **contract** in core (`packages/core/src/admin/`) and the **app** (`packages/admin/`). User docs: [customize the admin](../guide/admin.md).

## The idea

The admin is a compiled library that the host's own bundler includes. Core never imports it, so a headless setup costs nothing. The admin always runs on a page of its own.

Hosts extend it with `clientRef("./path.ts#export")`: a literal reference to an export in the host's own code, compiled by the host's Vite with HMR. A scan of the config finds these references at build time, so they MUST be literal. Adding one needs a dev server restart.

## Extension contract

- Everything crosses the boundary as `mount(el, ctx)`, which returns a cleanup function or `{ update(ctx), unmount() }`. No framework components cross it, so the admin bundles its own Vue and hosts install nothing.
- Data flows in by `ctx`, out by callbacks. Helpers live under `ctx.tenon`, never at the top level.
- Slots are fields (by custom type name), pages (by key), bar items, and rich text extensions.
- A registration can also have a server `load` function. It runs only on request, gets the signed-in user and a user-scoped `cms`, MUST only read, and MUST return JSON. The loader endpoint accepts registered keys only.
- The schema sent to the admin never runs a loader. Branding is also served before sign-in, without the rest of the schema.

## The app

- Vue 3, vue-router, Tailwind v4, built in Vite library mode. Vue is bundled and the CSS is inlined and injected by the mount function.
- Source is split by feature (`modules/api-keys`, `auth`, `documents`, `media`, `preview`, `settings`, `users`) plus `shared/`. Imports across folders use the `@/` alias.
- Types for registrations come from one file in core, which is the only copy.
- Two build outputs: the admin (`mount.js`) and the site's admin bar (`bar.js`).

### Layout

- A top app bar holds Content, Visual Editor, host pages that choose `main`, a link to the site, the language menu (only with `localization`), the perspective menu, search and the user menu.
- Content views sit in resizable **panes**: menu, list, document. Panes collapse to a strip when they do not fit and stack on phones.
- Every collection, global, page and the media library is a menu entry with `nav` defaults. Settings and Users entries are added when they apply.
- Pages with `nav.display` `main` or `none` open full width.

### Behavior worth knowing

- **Permissions** come from the schema endpoint. The admin hides entries without `read`, renders forms read-only without write rights, and hides actions it cannot do.
- **Drafts**: with drafts on, the form autosaves a draft shortly after the last edit. Save sends one request at a time. A draft save never resets the form. A new document is created by its first draft save.
- **Edit locks**: `DocPane` and `GlobalEdit` hold the lock through `useLock()` while the form is editable (Drafts view, update allowed, not new). It renews every `LOCK_TTL / 3` and frees on unmount. While someone else holds it, `LockNotice` names them and offers Take over, and the form is inert. Renewals keep claiming, so the lock comes back once they leave; `onRegain` then reloads the doc.
- **Edit conflicts**: every save and publish sends the `updatedAt` of the latest saved doc. A 409 with `code: "CHANGED"` makes `DocForm` show a message and a Reload button (`reload` prop), which drops the unsaved edits.
- **Perspective**: the preview cookie holds drafts or published. In the published view, forms are read-only, because an edit there would replace the pending draft.
- **Languages**: the content language is separate from the interface language. In the Drafts view, forms load the active language without fallback. The Published view keeps the fallback, because it shows what the site shows.
- **Interface language**: vue-i18n, with English and German. A missing key in one language fails the typecheck. Host text is `string | { en, de }`.
- **The "…" menu** (`DocActions`) has labeled groups: **Document** (History) for a saved entry the user MAY update, and **Translation** (Copy from, Copy to, Remove translation, Discard all) while the form is editable. The copy submenus label their languages too.
- **History**: `VersionHistory` replaces the form in `DocPane` and `GlobalEdit`. Opening it saves pending edits first. A version opens in `DocForm` without save handlers, so it is read-only and has no status bar and no autosave. `changedKeys()` (`modules/documents/versions.ts`) compares it with the version before it; `DocForm`'s `changed` marks those top-level fields and fades the rest. A change inside a group, array or blocks field marks the whole field. The list is split into calendar groups by `groupByTime()`. Both views have a back button at the top. Restore is off while the form would be read-only (Published view, someone else's lock). A language switch closes it.
- **Fields** are rendered by one recursive component. Conditions, layout (tabs, fieldsets, widths), lists and blocks are handled there.
- **Lists**: the top `ItemList` of a field creates the item tree (`useItemTree`), and its nested lists and the outline dialog share it. It holds the open rows (by id, so a row stays open when it moves), the dragged item and the drop position. Moves between lists change the form data in place (`moveItemTo`). Drag and drop is native HTML5; the innermost list that takes the item handles `dragover`, others let it bubble.
- **Tree appearance**: a list with `appearance: "tree"` renders `ItemTree` instead of `ItemList`. It creates the same item tree, so drag and drop and Move to are shared. `ItemOutline` with `tree` is its main view: `ItemTreeRow` per row (title and second line from `treeRow()` in `items.ts`, error dot from `hasErrorsAt()`) and `ItemTreeMenu` for its menu. The tree state also holds the item in the edit sheet (`editing`, a path) and the list that waits for a block pick (`picking`); `add`, `duplicate` and `remove` change the form data in place. `ItemSheet` edits the item's fields without its own lists, straight on the form data, so autosave and live preview follow. A failed save and a focus from `edit()` open the rows above the item (`itemChain()`); a focus also opens its sheet. Empty nested lists show only during a drag, as drop targets.
- **Links**: `DocForm` calls `provideLinks()` (`useLinks.ts`). It asks `client.links.resolve` once per language for every `link` reference in the form, on load in one request, later for new ones. Link inputs and tree rows read titles and paths from it. The `link` input searches with `client.links.search`, offers "Use <url>" for text that `urlFromText()` takes as a URL, and sets `target: "_blank"` with a switch.
- **Pane dialogs**: `Pane` provides its element (`injectPaneElement`). The `container` of `DialogContent` and `SheetContent` opens a dialog or sheet inside it, which the block picker, the outline and the tree's edit sheet use.

## UI rules

- Use shadcn components for every input and button. Raw `<input>`, `<button>` and `<select>` appear only in these places: the hidden file input of the media field (a `Button` opens it), the hidden `required` inputs of the choice, date and link fields, the date field's popover trigger, and the color input and `<select>`s of the rich text toolbar and link dialog.
- Use theme tokens, never fixed colors.
- Icons go through the one `Icon` component, which lazy-loads. Never import the icon library statically.
- The shared `.input`, `.btn` and `.btn-ghost` classes exist for host and plugin markup, which renders in the admin's light DOM. The admin's Tailwind scans only its own source, so such markup gets only classes the admin itself uses.
