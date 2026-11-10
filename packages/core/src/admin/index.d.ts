import type { Field, LocalApi, Rule } from "tenoncms";
import type { User } from "better-auth";
import type { IconName } from "./icons";

/**
 * Any JSON value. Loader results MUST be one: `null`, booleans, strings, finite numbers, arrays and plain objects.
 * An object property set to `undefined` counts as absent.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

// With the default `D = any`, a loader returns any JSON. With an explicit `D`, it returns `D`.
type Loaded<D> = unknown extends D ? Json : D;

/**
 * Anything the host plugs into the admin: a field input or a page.
 *
 * Runs once with an empty element and the context. Render into `el` with any framework or plain DOM.
 * Return a cleanup function, or `{ update, unmount }` to also receive context changes.
 *
 * `renderVue()` from `tenoncms/admin/vue` and `renderReact()` from `tenoncms/admin/react` build one
 * from a component.
 * @example
 * const mount: Mount<FieldContext> = (el, { value, onChange }) => {
 *   const input = document.createElement('input')
 *   input.value = value ?? ''
 *   input.oninput = () => onChange(input.value)
 *   el.append(input)
 *   return () => input.remove()
 * }
 */
export type Mount<Ctx> = (el: HTMLElement, ctx: Ctx) => (() => void) | MountHandle<Ctx>;

/** Returned by a {@link Mount} that reacts to context changes. */
export type MountHandle<Ctx> = {
  /** Called with the new context, e.g. when the field value or the route changes. */
  update?: (ctx: Ctx) => void;
  /** Called when the admin removes the element. MUST release everything the mount created. */
  unmount: () => void;
};

/** The languages of the admin UI. Each user picks one; it is independent of the content locales. */
export type AdminLocale = "en" | "de";

/**
 * A text the admin shows: one string for every admin language, or one per language.
 * A missing language shows English, then the first entry.
 * @example { en: "Posts", de: "Beiträge" }
 */
export type Text = string | Partial<Record<AdminLocale, string>>;

/** Helpers from the admin, in every context as `tenon`. */
export type TenonContext = {
  /** The admin language the user picked. A change of it calls `update(ctx)`. */
  locale: AdminLocale;
  /**
   * Path the admin is served at, e.g. `/admin`. Prefix links with it: `${base}/content/collections/posts`.
   *
   * Same-origin links under it open in the admin without a page reload. Links with `target`, `download`
   * or a modifier key, links elsewhere, and clicks with `preventDefault()` stay normal links.
   */
  base: string;
  /**
   * Opens an admin view without reloading the page. For links, a plain `href` under `base` is enough.
   * @param path Relative to {@link TenonContext.base}, e.g. `/reports/posts/1?tab=body`.
   */
  navigate: (path: string) => void;
  /**
   * Runs the server `load` of this field, page or bar item again and passes the result as the new `data`
   * through `update(ctx)`. Resolves when the new data arrived. A field reloads its own data only: the other
   * fields, the page and the bar items keep theirs. A no-op for an extension without `load`.
   */
  reload: () => Promise<void>;
};

/** Context of a custom field input. */
export type FieldContext<D = unknown> = {
  /** Field name in the collection, global or group, e.g. `color`. */
  name: string;
  /** Field definition from the config. */
  field: {
    /** Field type, e.g. `custom:color`. */
    type: string;
    /** Label shown above the input. */
    label?: Text;
    /** The document cannot be saved while the field is empty. */
    required?: boolean;
    /** The input SHOULD be shown disabled. The admin still saves the value. */
    readOnly?: boolean;
  };
  /** Current value. Custom fields store strings. `null` or `undefined` when empty. */
  value: any;
  /** Sets the value in the form. The admin saves it with the document. */
  onChange: (value: any) => void;
  /** What the server `load` of the field registration returned. `undefined` without a `load`. */
  data: D;
  /** Helpers from the admin. */
  tenon: TenonContext;
};

/**
 * Context of a custom page. Updates on every route change.
 *
 * To load or change content, use `createClient()` from `tenoncms/client`.
 * The admin's session cookie makes writes work.
 */
export type PageContext<D = unknown> = {
  /** Route params, e.g. `{ id }` for `/reports/:id`. */
  params: Record<string, string | string[]>;
  /** Query string, e.g. `{ tab: 'body' }` for `?tab=body`. */
  query: Record<string, string | string[] | null | (string | null)[]>;
  /** What the server `load` of the page registration returned. `undefined` without a `load`. */
  data: D;
  /** Helpers from the admin. */
  tenon: TenonContext;
};

/** Where and how an entry shows up in the admin navigation. */
export type Nav = {
  /**
   * Where the entry is listed.
   * - `content`: in the content sidebar (default). A page's `route` sits under `/content`.
   * - `settings`: on the Settings page, not in the sidebar. A page's `route` sits under `/content/settings`.
   * - `main`: as a tool in the top bar, next to Content and Visual Editor, sorted by `order`. Hidden in the
   *   sidebar. Below the `sm` breakpoint, tools sit in the menu sheet. A page's `route` is used as is, and it opens full
   *   width, without the content sidebar.
   * - `none`: nowhere. The route still opens as is, full width without the content sidebar, e.g. a detail page.
   */
  display?: "content" | "settings" | "main" | "none";
  /**
   * Only relevant for display `"content"` and `"settings"`.
   * Section of the sidebar or the Settings page. Defaults to `Content` in the sidebar and `Site` on the
   * Settings page. Sections appear in the order of their first entry.
   */
  group?: Text;
  /** Lucide icon name, e.g. `arrow-right-left`. See https://lucide.dev/icons. */
  icon?: IconName;
  /**
   * Position, lowest first.
   * In display `"content"`, Collections sit at 10, media at 15, globals at 20, pages default to 30.
   * Equal orders keep their definition order: host pages after plugin pages.
   */
  order?: number;
};

/**
 * An entry of the admin bar, the bar signed-in editors see on the site, as the bar renders it.
 *
 * Configure items with {@link AdminBarItemRegistration} in `admin.adminBar.items`.
 *
 * Built-in ids: `dashboard`, `edit` and `perspective`. Preview tabs show only `edit` and `live-edit`.
 */
export type AdminBarItem = {
  /** Unique. A later item with the same id replaces the earlier one. */
  id: string;
  /** Position, lowest first. Items without one follow the ordered ones, in insertion order. */
  order?: number;
  /** Text of the item. */
  label: Text;
  /** Lucide icon name, e.g. `chart-bar`. See https://lucide.dev/icons. */
  icon?: IconName;
  /** Link target. */
  href?: string;
  /** Runs on click. */
  onClick?: () => void;
  /** Entries of a dropdown. The item opens them instead of linking. */
  children?: AdminBarItem[];
  /**
   * Renders the item into `el` instead of a button, with plain DOM. `el` sits in the bar's shadow root, so the
   * page's CSS does not reach it: style it inline.
   * @example
   * mount: (el, ctx) => {
   *   el.textContent = ctx.perspective;
   *   return { update: (next) => (el.textContent = next.perspective), unmount: () => el.replaceChildren() };
   * }
   */
  mount?: Mount<AdminBarContext>;
};

/** What the admin bar renders. The site's preview runtime owns it and passes a new one on every change. */
export type AdminBarContext = {
  /** Edge of the page the bar sits at. */
  position: AdminBarPosition;
  /** `site` for a normal visit, `preview-tab` for a preview the admin opened in a tab. */
  mode: "site" | "preview-tab";
  /** Items to show, composed and sorted. */
  items: AdminBarItem[];
  /** Branding from the active admin configuration. */
  name?: string;
  logo?: Themed;
  icon?: Themed;
  /** Exits preview and restores the normal bar, or hides the normal bar for this page. */
  dismiss(): void;
  /** Which version of documents the page shows. */
  perspective: "drafts" | "published";
  /** Whether the on-page edit mode is on in a preview tab. */
  edit: boolean;
  /** Switches the perspective. Reloads the page. */
  setPerspective(perspective: "drafts" | "published"): void;
  /** Turns the preview tab's on-page edit mode on or off. */
  setEdit(edit: boolean): void;
};

/**
 * What a bar item's `mount` and `onClick` get: the bar context plus the item's own server data.
 * Updates when the bar or the data changes. A click handler gets the latest context.
 */
export type AdminBarItemContext<D = unknown> = AdminBarContext & {
  /** What the server `load` of this item returned. `undefined` without a `load`. Never another item's data. */
  data: D;
  /** Helpers from the admin. The bar has no admin `base`, so only `reload` and `locale` are here. */
  tenon: Pick<TenonContext, "reload" | "locale">;
};

/** One step of the breadcrumbs. */
export type Crumb = {
  /** Text of the step. */
  label: string;
  /** Link target, relative to {@link TenonContext.base}, e.g. `/content/reports`. */
  to: string;
};

/**
 * The visible header of a custom page. Synchronous. Gets the breadcrumbs of the route (a copy) and the page
 * context, and returns an HTML string or breadcrumbs.
 */
export type PageHeader<D = unknown> = (crumbs: Crumb[], ctx: PageContext<D>) => string | Crumb[];

/**
 * An image URL, or one per color scheme. Files MUST be served by the host, e.g. from `public/`: `/logo.svg`.
 * The admin links them and does not bundle them.
 */
export type Themed = string | { light: string; dark: string };

/** The eight supported floating bar positions. */
export type AdminBarPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * A browser export. The framework adapter finds the literal `clientRef()` call in the static import graph of
 * the server config, without running it, and bundles the export for the browser only.
 */
export type ClientRef<T = unknown> = { readonly clientRef: string; readonly __type?: T };

/** A browser export imported from a `.client` module, or an explicit reference. */
export type BrowserValue<T> = T | ClientRef<T>;

/** Current unsaved field data. `siblings` belongs to the containing group or list item. */
export type FieldDescriptionContext<V = any> = {
  value: V;
  data: Record<string, unknown>;
  siblings: Record<string, unknown>;
  path: string;
  locale: AdminLocale;
};

/** Synchronous browser help text. Return null or undefined to hide it. */
export type FieldDescription<V = any> = (
  ctx: FieldDescriptionContext<V>,
) => Text | null | undefined;

/**
 * Names a browser export. Relative paths resolve from the project root, `#name` picks an export (default
 * `default`), and a package specifier resolves through its exports.
 * @example
 * mount: clientRef("./src/admin/stats.ts#mountStats")
 */
export function clientRef<T = any>(specifier: string): ClientRef<T>;

/* ── Server loaders ─────────────────────────────────────────────────────────────────── */

/** A signed-in user: better-auth's user with its role (`admin`, `editor` or a host role). */
export type CmsUser = User & { role?: string | null };

/** What every `load` gets. A loader runs on the server and MUST only read. */
export type LoadContext = {
  /** The signed-in user. */
  user: CmsUser;
  /** The local API with that user. Reads follow the user's preview perspective. */
  cms: LocalApi;
  /** The admin language of the user, for text a loader returns. */
  locale: AdminLocale;
};

/** What the `load` of a page gets. Both are untrusted input from the browser. */
export type PageLoadContext = LoadContext & {
  /** Route params, same shape as {@link PageContext.params}. */
  params: PageContext["params"];
  /** Query string, same shape as {@link PageContext.query}. */
  query: PageContext["query"];
};

/** What the `load` of a custom field gets. */
export type FieldLoadContext = LoadContext & {
  /** The field definition from the schema. */
  field: Field;
  /** Stored path of the field, dotted through groups, e.g. `seo.color`. */
  path: string;
  /** The document or global that holds the field. A new collection document has no `id`. */
  owner: { collection: string; id?: string } | { global: string };
};

/** What the `load` of a bar item gets. */
export type BarItemLoadContext = LoadContext & {
  /** The URL of the page the bar shows on. It comes from the browser: never trust it, never fetch it. */
  url: string;
};

/* ── Registrations ──────────────────────────────────────────────────────────────────── */

/**
 * A custom field input, registered by field type. The key `color` handles fields with `type: 'custom:color'`.
 * @typeParam D What `load` returns and the field gets as `ctx.data`.
 */
export type FieldRegistration<D = any> = {
  /** Renders the input. Runs in the browser. */
  mount: BrowserValue<Mount<FieldContext<D>>>;
  /**
   * Runs on the server when the field mounts and when its owner changes. Not when its value changes.
   * Returns JSON, which the field gets as `ctx.data`.
   */
  load?: (ctx: FieldLoadContext) => Loaded<D> | Promise<Loaded<D>>;
};

/**
 * A custom admin page.
 * @typeParam D What `load` returns and the page gets as `ctx.data`.
 */
export type PageRegistration<D = any> = {
  /**
   * The name in the navigation, the document title and the default header text. Defaults to the page key.
   */
  title?: Text;
  /** Short text under the name on the Settings page. */
  description?: Text;
  /**
   * Path under the admin path. Defaults to `/<key>`. Params work: `/reports/:id`.
   *
   * With `nav.display` `content` (default) or `settings`, the admin prefixes it: `/stats` opens at
   * `/content/stats`. With `main` or `none` it is used as is, and `/` is the start page, which redirects to
   * `/content` unless a page takes it.
   *
   * A page on a built-in path, e.g. `/content/collections/posts`, replaces the built-in view.
   */
  route?: `/${string}`;
  /** Placement in the navigation. Defaults to the content sidebar. Use `{ display: 'none' }` for detail routes with params. */
  nav?: Nav;
  /**
   * The visible header area above the page: for pages with `nav.display` `content` or `settings` the header of
   * the page's pane, otherwise a bar above the page.
   * - `true`: the `title` as text (default).
   * - `false`: no header.
   * - `Crumb[]`: these breadcrumbs.
   * - `clientRef()` of a {@link PageHeader}: gets the breadcrumbs of the route and the page context, and returns
   *   an HTML string or breadcrumbs. Links in the HTML under `tenon.base` open without a reload. The admin
   *   does not escape the string: escape every untrusted value, e.g. `params`.
   * @example
   * pageHeader: clientRef('./src/admin/reports.ts#header')
   */
  pageHeader?: boolean | Crumb[] | BrowserValue<PageHeader<D>>;
  /** Renders the page. Runs in the browser. */
  mount: BrowserValue<Mount<PageContext<D>>>;
  /**
   * Runs on the server when the page opens and when its params or query change. Returns JSON, which the page
   * and its `pageHeader` get as `ctx.data`.
   */
  load?: (ctx: PageLoadContext) => Loaded<D> | Promise<Loaded<D>>;
};

/** What the `run` of an action gets. */
export type ActionContext = {
  /** The signed-in user who clicked. */
  user: CmsUser;
  /** The local API with that user, so its access rules apply. */
  cms: LocalApi;
};

/**
 * A one-click entry in the admin's navigation: the top bar or the content menu. With `run`, it is a button that runs on
 * the server when a user clicks; the admin shows the returned text, or the message of a throw, as a toast. With
 * `href`, it is an external link that opens in a new tab.
 * @example
 * actions: {
 *   deploy: {
 *     label: 'Deploy',
 *     nav: { icon: 'rocket' },
 *     run: async () => {
 *       await fetch(process.env.DEPLOY_HOOK_URL!, { method: 'POST' })
 *       return 'Deploy started'
 *     },
 *   },
 *   analytics: { label: 'Analytics', href: 'https://plausible.io/example.com' },
 * }
 */
export type ActionRegistration = {
  label: Text;
  /**
   * Where the entry sits: `display` `main` (the top bar, default) or `content` (the content menu). `group`, `icon`
   * and `order` work as for pages; the default order is 30.
   */
  nav?: Omit<Nav, "display"> & { display?: "main" | "content" };
  /** Who sees and runs the action: `true`, `false`, a list of roles or a function. Default: admins. */
  access?: Rule<{}>;
} & (
  | {
      /** A question the admin asks in a dialog before it runs the action, e.g. `Deploy the site now?`. */
      confirm?: Text;
      /** Runs on the server on click. MAY return a text for the toast. A throw fails the click with its message. */
      run: (ctx: ActionContext) => unknown;
      href?: never;
    }
  | {
      /** An `http` or `https` URL. The admin opens it in a new tab. */
      href: string;
      run?: never;
      confirm?: never;
    }
);

/** What `load` of a link or dropdown item may change on its registration. Returning `null` hides the item for the request. */
export type AdminBarItemOverrides = {
  label?: Text;
  icon?: IconName;
  href?: string;
  /** Replaces the registered children, by id. */
  children?: Record<string, { label: Text; icon?: IconName; href?: string; order?: number }>;
};

type BarItemBase = {
  /** Lucide icon name, e.g. `chart-bar`. See https://lucide.dev/icons. */
  icon?: IconName;
  /** Position, lowest first. Items without one follow the ordered ones, in registration order. */
  order?: number;
};

// A link or dropdown, rendered by the bar. `load` may return presentation overrides.
type NativeItem<Children> = BarItemBase & {
  /** Text of the item. */
  label: Text;
  /** Link target. */
  href?: string;
  /**
   * Entries of a dropdown by id. The item opens them instead of linking. One level only. An id is unique
   * across the bar, children included.
   */
  children?: Children;
  onClick?: never;
  mount?: never;
  /**
   * Runs on the server for every bar request. Returns overrides for `label`, `icon`, `href` and `children`, or
   * `null` to hide the item. The result never changes `id` or `order`.
   */
  load?: (
    ctx: BarItemLoadContext,
  ) => AdminBarItemOverrides | null | Promise<AdminBarItemOverrides | null>;
};

// A button. `load` returns data for the handler.
type ClickItem<D> = BarItemBase & {
  label: Text;
  /** Runs in the browser on click, with the latest item context. */
  onClick: BrowserValue<(ctx: AdminBarItemContext<D>) => void>;
  href?: never;
  children?: never;
  mount?: never;
  /** Runs on the server for every bar request. Returns JSON for `ctx.data`. `null` does not hide the item. */
  load?: (ctx: BarItemLoadContext) => Loaded<D> | Promise<Loaded<D>>;
};

// A custom control. `load` returns data for the mount.
type MountItem<D> = BarItemBase & {
  label: Text;
  /** Renders the item into the bar. Runs in the browser. */
  mount: BrowserValue<Mount<AdminBarItemContext<D>>>;
  href?: never;
  onClick?: never;
  children?: never;
  /** Runs on the server for every bar request. Returns JSON for `ctx.data`. `null` does not hide the item. */
  load?: (ctx: BarItemLoadContext) => Loaded<D> | Promise<Loaded<D>>;
};

/** An item of a dropdown. It takes everything an item takes, except `children`. */
export type AdminBarChildRegistration<D = any> = NativeItem<never> | ClickItem<D> | MountItem<D>;

/**
 * One admin bar item. It is one of:
 * - a link (`href`) or a dropdown (`children`), rendered by the bar, with an optional `load` for overrides;
 * - a button (`onClick`), with an optional `load` for the handler's data;
 * - a custom control (`mount`), with an optional `load` for the mount's data.
 * @typeParam D What `load` returns and the browser code gets as `ctx.data`.
 */
export type AdminBarItemRegistration<D = any> =
  | NativeItem<Record<string, AdminBarChildRegistration>>
  | ClickItem<D>
  | MountItem<D>;

/** The admin bar of the host. */
export type AdminBarOptions = {
  /** Edge of the page the bar sits at. Defaults to `bottom-center`. */
  position?: AdminBarPosition;
  /**
   * Items by id, added to the built-in ones and to the plugins' items. A later item with the same key replaces
   * the earlier one in place and brings its own `order`. `false` removes an item, built-in ones included,
   * before any loader or browser code runs.
   * @example
   * items: { perspective: false, analytics: { label: "Analytics", href: "/analytics" } }
   */
  items?: Record<string, AdminBarItemRegistration | false>;
};

/**
 * Admin customization. Pass it as `defineCms({ admin })`, inline or from an imported module. Check an extracted
 * object with `satisfies AdminOptions`.
 *
 * Loaders and rich text schema extensions run on the server. Browser implementations use `clientRef()`.
 * @example
 * admin: {
 *   name: "My site",
 *   fields: { color: { mount: clientRef("./src/admin/color.ts#mountColor") } },
 *   pages: {
 *     stats: {
 *       title: "Stats",
 *       load: async ({ cms }) => ({ posts: (await cms.find("posts", { populate: false })).length }),
 *       mount: clientRef("./src/admin/stats.ts#mountStats"),
 *     },
 *   },
 * }
 */
export type AdminOptions = {
  /** Tiptap extensions supplied by the host or plugins. */
  richtext?: import("tenoncms/richtext").RichtextOptions;
  /** Name of the CMS in the sidebar, the login and the page title. Defaults to `tenoncms`. */
  name?: string;
  /** Wide logo for the sidebar header and the login. Defaults to the icon, then to a placeholder. */
  logo?: Themed;
  /** Square icon for the collapsed sidebar. Also the favicon unless `favicon` is set. */
  icon?: Themed;
  /**
   * Favicon of the admin page. Defaults to `icon`, then to the host's `favicon.svg`, `.ico` or `.png`
   * in its public folder, if there is one.
   */
  favicon?: Themed;
  /**
   * Navigation entry of the media library. `label` and the `nav` keys replace its defaults
   * (`Media`, `Content`, `image`, 15).
   * @example
   * media: { nav: { group: 'Assets', icon: 'images' } }
   */
  media?: { label?: Text; nav?: Nav };
  /**
   * Inputs by custom field type. The key `color` handles fields with `type: 'custom:color'`.
   * A key a plugin or the host uses twice throws at startup.
   */
  fields?: Record<string, FieldRegistration>;
  /** Extra pages by key. A key a plugin or the host uses twice throws at startup. */
  pages?: Record<string, PageRegistration>;
  /** One-click buttons in the top bar or the content menu, by key. A key a plugin or the host uses twice throws. */
  actions?: Record<string, ActionRegistration>;
  /**
   * The admin bar signed-in editors see on the site, with links into the admin.
   * - omitted: the floating bar at bottom-center with the built-in items.
   * - `false`: no bar. Core adds no `/admin-bar` route.
   * - an object: its `position` and `items`.
   */
  adminBar?: false | AdminBarOptions;
};

/**
 * The admin registrations of a plugin: like {@link AdminOptions}, but a plugin only adds bar `items`. The
 * position and `false` belong to the host. The host's branding wins over the plugin's.
 */
export type PluginAdminOptions = Omit<AdminOptions, "adminBar"> & {
  adminBar?: { items?: Record<string, AdminBarItemRegistration | false> };
};

/* ── Wire format ────────────────────────────────────────────────────────────────────── */

/** A field registration as `/schema` sends it. `load` is only a flag: the function stays on the server. */
export type FieldDescriptor = {
  mount: ClientRef<Mount<FieldContext<any>>>;
  load?: true;
};

/** A page registration as `/schema` sends it. `load` is only a flag: the function stays on the server. */
export type PageDescriptor = Omit<PageRegistration, "mount" | "load" | "pageHeader"> & {
  mount: ClientRef<Mount<PageContext<any>>>;
  pageHeader?: boolean | Crumb[] | ClientRef<PageHeader<any>>;
  load?: true;
};

/** A bar item as the CMS holds it for requests. `load` is only a flag: the function stays on the server. */
export type AdminBarItemDescriptor = {
  id: string;
  hidden?: true;
  label?: Text;
  icon?: IconName;
  order?: number;
  href?: string;
  onClick?: ClientRef<(ctx: AdminBarItemContext<any>) => void>;
  mount?: ClientRef<Mount<AdminBarItemContext<any>>>;
  load?: true;
  children?: AdminBarItemDescriptor[];
};

/** An action as `/schema` sends it: only the actions the user MAY see, without `run` and `access`. */
export type ActionDescriptor = {
  label: Text;
  nav?: ActionRegistration["nav"];
  confirm?: Text;
  href?: string;
};

/**
 * What `GET /schema` sends as `admin`: branding and the active registrations of the plugins and the host,
 * without functions, request data or secrets.
 */
export type AdminDescriptor = Omit<
  AdminOptions,
  "fields" | "pages" | "actions" | "adminBar" | "richtext"
> & {
  richtext?: {
    extensions: Record<
      string,
      { client: ClientRef<import("tenoncms/richtext").RichtextBrowserExtension> }
    >;
  };
  fields: Record<string, FieldDescriptor>;
  pages: Record<string, PageDescriptor>;
  actions: Record<string, ActionDescriptor>;
};
