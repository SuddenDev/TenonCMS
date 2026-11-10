# Rich text

Owns the Tiptap document format, feature policy and rendering. Embedded CMS references follow the shared rules of the [links](../links/README.md) module: URL safety, target resolution, the publish check and deletion. This module keeps the Tiptap parts: walking the document, image `src`/`srcset` and stored JSON. The field contract stays in [schema](../schema/fields/richtext.ts), the editor in `packages/admin`, and the framework components in [integrations](../integrations/README.md). The [content engine](../content/README.md) calls this module during reads, writes and deletion.

## Follow a write

`content/writes/prepare-data.ts` → `writes/prepare-richtext.ts` → `runtime/validation.ts`

`prepareRichtext()` strips read decoration, keeps server-owned deletion markers (`keepDeletedMarker()` from links) and validates changed published content. Before saving, `content/writes/persist-document.ts` calls `links/integrity/check-links.ts` to check document and image targets in the write transaction.

## Follow a read

`content/reads/read-results.ts` → `reads/resolve-richtext.ts` → `runtime/walk.ts`

`resolveRichtext()` loads the targets through `resolveLinkTargets()` from links, using the caller's locale and perspective, then decorates the nodes. `runtime/render.ts` turns validated JSON into HTML without fetching references or mounting an editor. Deletion goes through `links/integrity/break-links.ts` in the deletion transaction.

## Field configuration

A `richtext` field stores a normal Tiptap JSON document, without an HTML copy or a wrapper:

```ts
body: { type: 'richtext' }
summary: { type: 'richtext', allowed: ['bold', 'italic', 'link'] }
plain: { type: 'richtext', allowed: [] }
```

Omitting `allowed` enables `RICHTEXT_DEFAULTS` and every registered plugin feature. Renderers enable every feature and both class places, so stored content renders whatever the field allows. The feature names are `heading`, `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `code`, `codeBlock`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `horizontalRule`, `textAlign`, `color`, `highlight`, `table`, `link`, `image`, and plugin registration keys. Paragraphs, text, line breaks, undo/redo and pane expansion are always available. List and table dependencies are automatic. Rich text cannot be used in `where` or as a unique field.

Changed published content must fit the enabled schema. Drafts keep the CMS's loose validation, with structural and URL safety checks. Publishing validates their schema and targets. In the editor, `pruneRichtext()` hides saved marks and attributes the field does not offer, and the next edit removes them. Unsupported saved nodes stay read-only, with their original JSON intact. Unchanged published values can pass through unrelated writes after a configuration change. Restore the extension or explicitly migrate content to edit it again.

## Classes

A field's `classes` add `attrs.class` to paragraphs and headings (`block`) and a `textClass` mark (`text`). The schema only knows that the attribute exists; `validateRichtext()` checks the names against the field. `checkRichtextField()` checks the list at startup. The admin editor renders classes as `data-class` (`ClassPlaces.attribute`), so a host class cannot style the admin.

## Relations and URLs

A link mark or image node holds `attrs.reference: { collection, id }`. A manually entered link instead holds `attrs.href`. Link targets support `_self`, `_blank`, `_parent` and `_top`; new-tab links receive `noopener noreferrer`. HTTP(S), email, telephone, relative paths and fragments are supported. Executable schemes are rejected.

`populate: false` returns stored JSON. Normal population decorates referenced links with the current collection `permalink` in `attrs.href`, and images with `attrs.src` and `attrs.srcset`. Collection preview URLs are never used as public link destinations. Resolution respects the read's perspective and locale, batches target loads by collection and runs target read hooks. It does not embed target documents or private fields. `attrs.broken` marks an unavailable target. Image alt text remains authored content.

`storedRichtext()` removes read decoration for saving. The write pipeline also removes it. Reference identities survive HTML clipboard operations through `data-cms-reference` attributes.

The protected `client.links.search({ query, locale })` method returns collection sections containing at most 20 title matches each. It searches only collections with a `permalink`. `client.links.resolve(document, { locale })` decorates unsaved editor JSON without writing anything. Both read in the perspective of the preview cookie, like every other read. `safeRichtextUrl()` is `safeLinkUrl()` from links.

## Deletion

Deleting a target with incoming rich-text references throws `LinkedContentError` (HTTP `409`, `code: 'LINKED_CONTENT'`) with owner, field, locale and draft details. Confirming in the admin retries with `{ allowBrokenLinks: true }`. Trusted callers can pass the same option to `cms.delete`, `cms.media.delete` or `cms.discard`.

The check and deletion share a transaction. Confirmed deletion preserves the reference and text, recording `reference.deleted: true` in every affected published/draft/locale value. Images remain repairable placeholders. This metadata is server-owned; writes cannot invent it. Existing broken references can remain when a document is edited or published. Ordinary relation restrictions and media storage cleanup timing still apply.

Reverse discovery (in links) scans JSON only for owners whose schemas contain rich text or `link` fields. It needs no database migration. Add an index if the number or size of those owners makes deletions slow.

## Plugin extensions

A plugin or host adds `admin.richtext.extensions` entries. Each entry has a DOM-free `schema` Tiptap extension (or array) and a literal `clientRef()` called `client`:

```ts
admin: {
  richtext: {
    extensions: {
      notice: {
        schema: Notice,
        client: clientRef('my-plugin/admin#notice'),
      },
    },
  },
}
```

The browser export is `{ extensions: [Notice], controls?: [...] }`. Each control has a translated `label`, `run(editor)` and optional `active(editor)` / `disabled(editor)`. Browser implementations MUST use the same persisted node/mark names, attributes and content rules as their server schema. DOM node views belong only in the browser implementation. Attribute validators belong in the shared schema. Duplicate feature or extension names throw. Built-in feature names are reserved.

The server schema stays on the server; `/schema` sends only the browser reference. Missing browser code or incompatible saved JSON prevents editing without changing the stored value. The bundled example plugin demonstrates `exampleNotice` in its `quotes.notes` field.

## Rendering

The frontend components render Tiptap JSON in an unstyled `<div>` (or the `as` element), both on the server and in the browser. They accept `content` (including `null` or `undefined`), optional `extensions` keyed by feature, and normal wrapper attributes. Vue also covers Nuxt. No editor is mounted and no admin typography is included.

```astro
---
import { Richtext } from 'tenoncms/astro/components';
---
<Richtext content={post.body} class="prose" />
```

```vue
<script setup lang="ts">
import { Richtext } from "tenoncms/richtext/vue";
defineProps<{ post: { body: import("tenoncms/richtext").RichtextDocument | null } }>();
</script>

<template>
  <Richtext :content="post.body" class="prose" />
</template>
```

```tsx
import { Richtext } from "tenoncms/richtext/react";

<Richtext content={post.body} className="prose" />;
```

Use populated content for current media and internal-link URLs. The components do not fetch references themselves. Vue and React re-render when their content changes, including documents returned by the preview helpers.

`renderRichtext(content, extensions?)` from `tenoncms/richtext` returns the same HTML for other templates. It uses Tiptap's static renderer, escapes text and attributes, validates URLs and rejects unsupported content rather than dropping it. Custom extensions MUST be trusted, work without a DOM and supply `renderHTML`; editor node views are not used. Pass their schema extensions as `{ featureName: [Extension] }`. The renderer does not change the input JSON.

`richtextExtensions()` remains available for hosts that use Tiptap's rendering tools directly.

## Files

| Path                         | Responsibility                                                       |
| ---------------------------- | -------------------------------------------------------------------- |
| `index.ts`                   | Public exports for `tenoncms/richtext`.                              |
| `config/types.ts`            | Document, reference, extension registration and editor contracts.    |
| `config/check-config.ts`     | Field feature checks after plugin registrations merge.               |
| `runtime/extensions.ts`      | Built-in Tiptap features and the shared editor/server schema.        |
| `runtime/validation.ts`      | JSON shape, URL safety, feature and content checks.                  |
| `runtime/walk.ts`            | Document traversal, reference extraction and stored JSON.            |
| `runtime/render.ts`          | Validated HTML rendering for frontend components and direct callers. |
| `reads/resolve-richtext.ts`  | Link and image URL decoration from the resolved targets.             |
| `writes/prepare-richtext.ts` | Write normalization, deletion markers and content validation.        |

Internal browser code MUST use type-only imports from `config/types.ts` and import runtime functions from their leaves. Runtime files MUST stay free of the CMS runtime and database imports. The public export names and package paths stay independent of this source layout. The admin lazy-loads the rich-text field and its Tiptap dependencies.
