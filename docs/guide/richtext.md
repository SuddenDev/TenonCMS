# Rich text

A `richtext` field stores a standard Tiptap JSON document. There is no HTML copy and no wrapper.

```ts
body: { type: 'richtext' }
summary: { type: 'richtext', allowed: ['bold', 'italic', 'link'] }
plain: { type: 'richtext', allowed: [] }
everything: { type: 'richtext', allowed: RICHTEXT_FEATURES } // from "tenoncms/richtext"
```

- Without `allowed`, the field has `heading`, `bold`, `italic`, `link`, `bulletList`, `orderedList`, `blockquote` (`RICHTEXT_DEFAULTS`) and every registered extension. List the others in `allowed`.
- `allowed` autocompletes the built-in names. An unknown name throws at startup.
- Features: `heading`, `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `code`, `codeBlock`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `horizontalRule`, `textAlign`, `color`, `highlight`, `table`, `link`, `image`, and the keys that plugins register.
- Paragraphs, text, line breaks and undo/redo are always on. List and table dependencies are automatic.
- A rich text field cannot be used in `where` or as `unique`.
- Changed published content MUST fit the enabled features. Drafts only get structure and URL safety checks. Publishing runs the full check.
- Saved formatting the field does not offer (a mark or an attribute, like a pasted color) is hidden in the editor, with a note, and removed on the next edit. The site still renders it until then.
- Saved content of a type the field does not offer, like a table, stays read-only in the editor, with its JSON intact, because removing it would lose content. Unrelated writes still pass it through.

## Classes

`classes` lets editors apply your CSS classes: `block` ones to a paragraph or heading, `text` ones to the selected text. A palette button in the toolbar opens a menu with both lists; picking an active class again removes it.

```ts
body: {
  type: 'richtext',
  classes: [
    { name: 'lead', label: { en: 'Lead', de: 'Einleitung' }, on: 'block' },
    { name: 'text-brand font-bold', label: 'Brand', on: 'text', preview: { color: '#c2410c' } },
  ],
}
```

- A block class is stored as `attrs.class` on the node, a text class as a `textClass` mark: `{ type: 'textClass', attrs: { class: 'text-brand font-bold' } }`.
- The renderers write it as `class`: `<p class="lead">`, `<span class="text-brand font-bold">`. Style it in your site's CSS.
- `name` MAY hold several classes, separated by single spaces. A name that the field does not list for its place is a field error.
- The admin does not load your CSS. It marks classed blocks with a dashed line and classed text with a dotted underline. `preview` adds CSS (camelCase, like Vue's `style`) that the editor and the menu show for that class.

## Links and images

A link or image can point to a CMS document or to a URL.

- A reference holds `attrs.reference: { collection, id }`. A manual link holds `attrs.href`.
- Link targets are `_self`, `_blank`, `_parent` and `_top`. New-tab links get `noopener noreferrer`.
- HTTP(S), email, telephone, relative paths and fragments are allowed. Executable schemes are rejected.
- `populate: false` returns the stored JSON. Normal population adds the target's `permalink` as `attrs.href`, and `attrs.src` and `attrs.srcset` for images. Preview URLs are never used.
- Resolution follows the read's perspective and locale, batches loads by collection and runs the target's read hooks. It embeds no target documents or private fields.
- `attrs.broken` marks a target that is not available.

Rich text shares these rules with the [`link` field](./schema.md#links): URL safety, target resolution, the publish check and deletion.

In the browser, `client.links.search({ query, locale })` returns up to 20 title matches per collection that has a `permalink`. `client.links.resolve(document, { locale })` decorates unsaved editor JSON. Both need a session and read in the perspective of the preview cookie.

## Deleting linked content

Deleting a document or file that rich text or a `link` field links to throws `LinkedContentError` (HTTP 409, `code: 'LINKED_CONTENT'`). It names the owner, field, locale and draft.

- The admin asks for confirmation and retries with `{ allowBrokenLinks: true }`. Server code can pass the same option to `cms.delete`, `cms.media.delete` and `cms.discard`.
- A confirmed delete keeps the text and the reference and marks it `reference.deleted: true` in every published, draft and locale value. Images become placeholders you can repair.
- The check and the delete share one transaction.

## Render on the site

The [components](./components.md) render Tiptap JSON as an unstyled `<div>`, on the server and in the browser. No editor and no admin styles load.

```astro
---
import { Richtext } from "tenoncms/astro/components";
---

<Richtext content={post.body} class="prose" />
```

```vue
<script setup lang="ts">
import { Richtext } from "tenoncms/vue"; // in Nuxt: <TenonRichtext>, auto-imported
</script>

<template>
  <Richtext :content="post.body" class="prose" as="article" />
</template>
```

```tsx
import { Richtext } from "tenoncms/react";

<Richtext content={post.body} className="prose" />;
```

- `content` can be `null` or `undefined`. Pass populated content to get current link and image URLs; the components fetch nothing.
- `extensions` adds renderers for custom features, keyed by feature name.
- `as` sets the element (default `div`). In Vue and React, `asChild` renders into the child element. See [Components](./components.md).
- `renderRichtext(content, extensions?)` from `tenoncms/richtext` returns the same HTML for any other template. It escapes text, checks URLs, and rejects unsupported content instead of dropping it.

## Add features from a plugin

A plugin or the host adds `admin.richtext.extensions`. Each entry has a `schema` (a Tiptap extension without DOM code) and a `client`, the browser part. In the host, import it from a `.client.ts` module, so it is typed as `RichtextBrowserExtension` ([browser exports](./admin.md)). A plugin uses `clientRef()`:

```ts
admin: {
  richtext: {
    extensions: {
      notice: { schema: Notice, client: clientRef("my-plugin/admin#notice") },
    },
  },
}
```

- The browser export is `{ extensions: [Notice], controls?: [...] }`. A control has a translated `label`, `run(editor)` and optional `active(editor)` and `disabled(editor)`.
- Browser and server MUST use the same node and mark names, attributes and content rules. Node views belong only in the browser part.
- Duplicate names throw, and built-in feature names are reserved.
- The `example` plugin shows `exampleNotice` in its `quotes.notes` field.

How it works inside core: [packages/core/src/richtext/README.md](../../packages/core/src/richtext/README.md).
