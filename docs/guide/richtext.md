# Rich text

A `richtext` field stores a standard Tiptap JSON document. There is no HTML copy and no wrapper.

```ts
body: { type: 'richtext' }
summary: { type: 'richtext', allowed: ['bold', 'italic', 'link'] }
plain: { type: 'richtext', allowed: [] }
```

- Without `allowed`, every built-in and plugin feature is on.
- Features: `heading`, `bold`, `italic`, `underline`, `strike`, `subscript`, `superscript`, `code`, `codeBlock`, `bulletList`, `orderedList`, `taskList`, `blockquote`, `horizontalRule`, `textAlign`, `color`, `highlight`, `table`, `link`, `image`, and the keys that plugins register.
- Paragraphs, text, line breaks and undo/redo are always on. List and table dependencies are automatic.
- A rich text field cannot be used in `where` or as `unique`.
- Changed published content MUST fit the enabled features. Drafts only get structure and URL safety checks. Publishing runs the full check.
- Saved content that the schema no longer allows stays read-only in the editor, with its JSON intact. Unrelated writes still pass it through.

## Links and images

A link or image can point to a CMS document or to a URL.

- A reference holds `attrs.reference: { collection, id }`. A manual link holds `attrs.href`.
- Link targets are `_self`, `_blank`, `_parent` and `_top`. New-tab links get `noopener noreferrer`.
- HTTP(S), email, telephone, relative paths and fragments are allowed. Executable schemes are rejected.
- `populate: false` returns the stored JSON. Normal population adds the target's `permalink` as `attrs.href`, and `attrs.src` and `attrs.srcset` for images. Preview URLs are never used.
- Resolution follows the read's perspective and locale, batches loads by collection and runs the target's read hooks. It embeds no target documents or private fields.
- `attrs.broken` marks a target that is not available.

In the browser, `client.richtext.search({ query, locale })` returns up to 20 title matches per collection that has a `permalink`. `client.richtext.resolve(document, { locale })` decorates unsaved editor JSON. Both need a session.

## Deleting linked content

Deleting a document or file that rich text links to throws `LinkedContentError` (HTTP 409, `code: 'LINKED_CONTENT'`). It names the owner, field, locale and draft.

- The admin asks for confirmation and retries with `{ allowBrokenLinks: true }`. Server code can pass the same option to `cms.delete`, `cms.media.delete` and `cms.discard`.
- A confirmed delete keeps the text and the reference and marks it `reference.deleted: true` in every published, draft and locale value. Images become placeholders you can repair.
- The check and the delete share one transaction.

## Render on the site

The components render Tiptap JSON as an unstyled `<div>`, on the server and in the browser. No editor and no admin styles load.

```astro
---
import Richtext from "tenoncms/richtext/astro";
---

<Richtext content={post.body} class="prose" />
```

```vue
<script setup lang="ts">
import { Richtext } from "tenoncms/richtext/vue";
</script>

<template>
  <Richtext :content="post.body" class="prose" />
</template>
```

```tsx
import { Richtext } from "tenoncms/richtext/react";

<Richtext content={post.body} className="prose" />;
```

- `content` can be `null` or `undefined`. Pass populated content to get current link and image URLs; the components fetch nothing.
- `extensions` adds renderers for custom features, keyed by feature name.
- `renderRichtext(content, extensions?)` from `tenoncms/richtext` returns the same HTML for any other template. It escapes text, checks URLs, and rejects unsupported content instead of dropping it.

## Add features from a plugin

A plugin or the host adds `admin.richtext.extensions`. Each entry has a `schema` (a Tiptap extension without DOM code) and a `client` (a `clientRef()` to the browser part):

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
