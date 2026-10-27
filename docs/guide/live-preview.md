# Live preview

Editors see your real site next to the form, and every unsaved edit shows up in it as they type.

- In the admin, **Visual Editor** in the top bar opens `/presentation`: the site in a frame, with edit mode on.
- A click on a marked element opens its document next to the page (`/presentation/collections/:name/:id`, `/presentation/globals/:name`). The eye button on a document opens the same view.
- The perspective menu in the top bar switches the admin and its previews between drafts and published documents.

## 1. Say where a document lives

`permalink` on a collection or global is the template of the document's public URL. Your routes MUST serve it. `preview` defaults to it and tells the admin which page to open. Set `preview` only when the frame should show another page.

```ts
posts: {
  // Placeholders walk into groups and through one relation. A missing value means no preview.
  permalink: "/{category.slug}/{slug}",
  fields: { ... },
},
notes: {
  // Or a function of the unsaved form state and the local API. `null`: no preview.
  permalink: async (doc, { cms }) => (doc.slug ? `/notes/${doc.slug}` : null),
  fields: { ... },
},
```

The pages preset has `page.permalink` (`"{path}"`). Add `permalink: page.permalink` to the collection. A placeholder that names no stored field throws at startup.

## 2. Mark what a field renders

On the site, mark each element with `edit()` and start the runtime with `preview()`. It is safe on every page: visitors without a session see nothing.

```ts
import { edit, preview } from "integral-cms/preview";

preview();
// <h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
// <img data-cms={edit("posts", post.id, "hero")} data-cms-attr="src,srcset,alt" src={post.hero.src} />
// Globals pass `null` as the id: edit("general", null, "title")
```

- Marked elements get the typed text, or the listed attributes, on every keystroke.
- With edit mode on, a click on one focuses its field in the admin.
- For a field inside a list item, use the positional path: `edit("pages", page.id, "content.2.title")`.

`preview({ admin: "/cms" })` sets the admin path for the links (default `/admin`). `admin: false` turns the admin bar off on the site. The Astro and Nuxt adapters pass their own `admin` option.

### Keep content out of edit mode

`visualEditing: false` on a collection or global keeps editors from picking it on a page. "On this page" leaves it out, and edit mode neither outlines nor opens its elements. A click on one opens the marked element around it, if there is one. Live preview of unsaved changes still applies. Use it for content that visitors write, like comments.

```ts
defineCollection({ visualEditing: false, fields: { body: { type: "textarea" } } });
```

## 3. Re-render from the unsaved state (optional)

Marked elements update on their own. To make lists and conditions follow too, Vue and React pages can use `useDraft()`. It merges the unsaved state into the document and starts the runtime. Items of an `array` or `blocks` field match by `id`, and a relation whose ids did not change keeps its populated value.

```ts
import { useDraft } from "integral-cms/preview/vue"; // or integral-cms/preview/react
const post = useDraft("posts", data); // Vue: a ref; React: the merged value
```

## Per framework

- **Astro**: the integration injects `preview({ morph: true })` into every page. `integralCms({ preview: false })` leaves it out. Astro pages render on the server, so while you type only marked elements update. After each draft save, the runtime fetches the page again (with the preview cookie, so it renders the drafts) and morphs `<body>` and the title into it. Prerendered pages fetch their static HTML, so they only get the marked-element updates.
- **Nuxt**: the module starts the runtime in a client plugin. `useIntegral()` merges the unsaved state into the `data` of `find`, `findOne`, `findById` and `getGlobal`. Pages only add `edit()`.
- **TanStack Start and other Vite hosts**: call `preview()` once in the root component, in a `useEffect`, and pass loader data through `useDraft()`:

```tsx
// src/routes/__root.tsx
useEffect(() => preview(), []);
// src/routes/posts/$slug.tsx
const post = useDraft("posts", Route.useLoaderData());
```

## Where the runtime shows up

The runtime picks its mode from `window.name`:

| Where                            | What it does                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The admin's preview frame        | Applies the unsaved state. No bar.                                                                                                                          |
| A preview tab the admin opened   | Also shows the admin bar with an "Edit" switch and "Exit preview".                                                                                          |
| Any other page, signed-in editor | Shows the admin bar. Visitors download nothing extra: the bar loads only when the `integral-session` cookie is set. Sign-in sets it and sign-out clears it. |

## Admin bar

The admin bar is a floating pill on your site with your brand, an Edit button, the Drafts / Published menu and a dismiss button.

- Edit opens the visual editor with the current page URL, including its query and fragment.
- Dismiss hides the bar for this page.
- A preview tab shows only "Back to visual editor", an "Edit preview" switch for selecting fields, and a close button. Closing the preview disconnects live updates, removes overlays and restores the normal bar without a reload.
- It defaults to `bottom-center`, 16 px from the viewport edge, with safe-area spacing. Positions: `top-left`, `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`.
- It stays visible while editing or focused. Otherwise it hides when you scroll down.
- On phones it uses at most 95% of the viewport width, and items scroll sideways while the dismiss button stays visible.
- The bar and its popups live in a shadow root, so your page's CSS does not reach them.

### Configure it

```ts
// integral.config.ts
import { clientRef } from "integral-cms/admin";

defineCms({
  admin: {
    // Omitted: bottom-center with the built-in items. `false`: no bar.
    adminBar: {
      position: "bottom-center",
      // The key is the item's id.
      items: {
        // A link. `load` runs on the server and may override `label`, `icon`, `href` and `children`.
        analytics: {
          label: "Analytics",
          icon: "chart-bar",
          order: 40,
          load: ({ url }) => ({
            href: `https://analytics.example.com/?url=${encodeURIComponent(url)}`,
          }),
        },
        // A button. `load` gives the handler its data as `ctx.data`.
        hello: {
          label: "Say hello",
          onClick: clientRef("./src/admin/bar.ts#sayHello"),
          load: ({ user }) => ({ editor: user.name }),
        },
        // Removes a built-in item.
        perspective: false,
      },
    },
  },
});
```

`admin.adminBar.items` is an object of registrations, and the key is the item's id. A later registration with the same key replaces the earlier one completely, with no field merge. An item has an `order` and an `icon`, and is one of:

| Kind           | How                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link           | `href`                                                                                                                                                                |
| Dropdown       | `children`: an object keyed by id like `items`. An id is unique across the bar, children included. A child takes everything an item takes, except its own `children`. |
| Button         | `onClick: clientRef(...)`, run in the browser with the latest item context                                                                                            |
| Custom control | `mount: clientRef(...)`, the same `mount(el, ctx)` contract as fields and pages                                                                                       |
| Removal        | `false` instead of an item removes the item with that key, built-ins included, before any loader or browser code runs                                                 |

Rules:

- `mount` cannot be combined with `href`, `onClick` or `children`. `onClick` cannot be combined with `href` or `children`. Both throw at startup, as does a missing `label`.
- The bar is one flat row sorted by `order`, then by registration order. Items without `order` follow.
- Built-ins and their orders: `dashboard` 10, `edit` 20, `perspective` 30. Plugins add items the same way, see [Plugins](./plugins.md). They compose in this order: built-ins, plugins in plugin order, then the host.
- Preview tabs show the fixed `edit` (10) and `live-edit` (20) controls. Custom items and their loaders do not run there.
- `position` and `adminBar: false` belong to the host.

### Loaders

`load` is optional and runs on the server for every bar request, with `{ user, cms, locale, url }`. `url` is the page the bar shows on. It comes from the browser and is never fetched.

- **Link or dropdown**: the result is an overlay of `label`, `icon`, `href` and `children`. A loader may replace the children for the request with an object of the same shape. `null` hides the item for that request.
- **Button or custom control**: the result is any JSON and arrives as `ctx.data`. `null` is valid data. Each item only sees its own data.
- A loader that throws or returns something invalid is logged and the item is skipped. The rest of the bar stays.
- `ctx.integral.reload()` runs one item's loader again.

### Custom controls

An item with `mount(el, ctx)` renders its own element with plain DOM, like the admin's extension slots. It returns a cleanup function or `{ update(ctx), unmount() }`. `update` receives the new context, for example after a perspective change. `el` sits in the bar's shadow root, so style it inline. See the example plugin in `packages/plugins/src/example/`.
