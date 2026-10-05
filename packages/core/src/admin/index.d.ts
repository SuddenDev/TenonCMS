import type { IconName } from "./icons";

/**
 * Anything the host plugs into the admin: a field input or a page.
 *
 * Runs once with an empty element and the context. Render into `el` with any framework or plain DOM.
 * Return a cleanup function, or `{ update, unmount }` to also receive context changes.
 *
 * `renderVue()` from `integral-cms/admin/vue` and `renderReact()` from `integral-cms/admin/react` build one
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

/** Helpers from the admin, in every context as `integral`. */
export type IntegralContext = {
  /**
   * Path the admin is served at, e.g. `/admin`. Prefix links with it: `${base}/content/collections/posts`.
   *
   * Same-origin links under it open in the admin without a page reload. Links with `target`, `download`
   * or a modifier key, links elsewhere, and clicks with `preventDefault()` stay normal links.
   */
  base: string;
  /**
   * Opens an admin view without reloading the page. For links, a plain `href` under `base` is enough.
   * @param path Relative to {@link IntegralContext.base}, e.g. `/reports/posts/1?tab=body`.
   */
  navigate: (path: string) => void;
};

/** Context of a custom field input. */
export type FieldContext = {
  /** Field name in the collection, global or group, e.g. `color`. */
  name: string;
  /** Field definition from the config. */
  field: {
    /** Field type, e.g. `custom:color`. */
    type: string;
    /** Label shown above the input. */
    label?: string;
    /** The document cannot be saved while the field is empty. */
    required?: boolean;
    /** The input SHOULD be shown disabled. The admin still saves the value. */
    readOnly?: boolean;
  };
  /** Current value. Custom fields store strings. `null` or `undefined` when empty. */
  value: any;
  /** Sets the value in the form. The admin saves it with the document. */
  onChange: (value: any) => void;
  /** Helpers from the admin. */
  integral: IntegralContext;
};

/**
 * Context of a custom page. Updates on every route change.
 *
 * To load or change content, use `createClient()` from `integral-cms/client`.
 * The admin's session cookie makes writes work.
 */
export type PageContext = {
  /** Route params, e.g. `{ id }` for `/reports/:id`. */
  params: Record<string, string | string[]>;
  /** Query string, e.g. `{ tab: 'body' }` for `?tab=body`. */
  query: Record<string, string | string[] | null | (string | null)[]>;
  /** Helpers from the admin. */
  integral: IntegralContext;
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
  group?: string;
  /** Lucide icon name, e.g. `arrow-right-left`. See https://lucide.dev/icons. */
  icon?: IconName;
  /**
   * Position, lowest first.
   * In display `"content"`, Collections sit at 10, media at 15, globals at 20, pages default to 30.
   * Equal orders keep their definition order: host pages after plugin pages.
   */
  order?: number;
};

/** One step of the breadcrumbs. */
export type Crumb = {
  /** Text of the step. */
  label: string;
  /** Link target, relative to {@link IntegralContext.base}, e.g. `/content/reports`. */
  to: string;
};

/** A custom admin page. */
export type Page = {
  /** Name in the navigation, the page title and the breadcrumbs. Defaults to the page key. */
  title?: string;
  /** Short text under the name on the Settings page. */
  description?: string;
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
   * The title bar above the page. It shows the breadcrumbs: for pages with `nav.display` `content` or
   * `settings` in the header of the page's pane, otherwise in a bar above the page.
   * - `true`: the breadcrumbs (default).
   * - `false`: no title.
   * - `Crumb[]`: these breadcrumbs.
   * - A function: gets the default breadcrumbs (a copy) and the page context, and returns what the bar
   *   shows: new breadcrumbs, or an HTML string. Links in the HTML under `integral.base` open without a
   *   reload. The admin does not escape the string: escape every untrusted value, e.g. `params`.
   * @example
   * showPageTitle: [{ label: 'Reports', to: '/content/reports' }]
   * showPageTitle: (crumbs) => crumbs.slice(-1)
   * showPageTitle: (crumbs, { params }) => `<strong>Report ${escape(params.id)}</strong>`
   */
  showPageTitle?: boolean | Crumb[] | ((crumbs: Crumb[], ctx: PageContext) => string | Crumb[]);
  /** Renders the page. */
  mount: Mount<PageContext>;
};

/** Pass it to `defineAdmin({ plugins })`. */
export type AdminPlugin = {
  /** Name of the plugin, for error messages. */
  name: string;
  /** Inputs by custom field type. A key the host or another plugin uses throws when the admin mounts. */
  fields?: Record<string, Mount<FieldContext>>;
  /** Pages by key. A key the host or another plugin uses throws when the admin mounts. */
  pages?: Record<string, Page>;
};

/**
 * An image URL, or one per color scheme. Files MUST be served by the host, e.g. from `public/`: `/logo.svg`.
 * The admin links them and does not bundle them.
 */
export type Themed = string | { light: string; dark: string };

/** Admin customization. Default export of `integral.admin.ts`. */
export type AdminOptions = {
  /** Name of the CMS in the sidebar, the login and the page title. Defaults to `integral-cms`. */
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
  media?: { label?: string; nav?: Nav };
  /**
   * Inputs by custom field type. The key `color` handles fields with `type: 'custom:color'`.
   * @example
   * fields: { color: renderVue(ColorInput) }
   */
  fields?: Record<string, Mount<FieldContext>>;
  /**
   * Extra pages by key.
   * @example
   * pages: { stats: { title: 'Stats', nav: { icon: 'chart-bar' }, mount: renderVue(Stats) } }
   */
  pages?: Record<string, Page>;
  /** Admin halves of plugins, from `defineAdminPlugin()`. Their fields and pages merge in, before the host's. */
  plugins?: AdminPlugin[];
};

/**
 * Types the admin options. Use it as the default export of `integral.admin.ts`.
 * @example
 * export default defineAdmin({
 *   fields: { color: renderVue(ColorInput) },
 *   pages: { stats: { title: 'Stats', mount: renderVue(Stats) } },
 *   plugins: [redirectsAdmin()],
 * })
 */
export function defineAdmin(options: AdminOptions): AdminOptions;

/** Types the admin half of a plugin. Use it as the return value of the plugin's admin factory. */
export function defineAdminPlugin(plugin: AdminPlugin): AdminPlugin;

/**
 * Mounts the admin into `el` and returns an unmount function.
 *
 * Astro, Nuxt and `integral-cms/vite` call it for you on the admin path. Elsewhere, call it on a page of its own:
 * the admin's styles are global and stay after unmount.
 * @param el Element or CSS selector.
 * @param options Usually the default export of `integral.admin.ts`.
 * @param base Path the admin is served at. Defaults to `/admin`.
 * @param favicon URL of the host's own favicon, used when `options` sets neither `favicon` nor `icon`.
 */
export function mountAdmin(
  el: string | Element,
  options?: AdminOptions,
  base?: string,
  favicon?: string | null,
): () => void;
