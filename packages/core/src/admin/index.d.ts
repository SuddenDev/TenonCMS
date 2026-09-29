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
   * Path the admin is served at, e.g. `/admin`. Prefix links with it: `${base}/collections/posts`.
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

/** A sidebar entry. */
export type Menu = {
  label: string;
  /** Sidebar section. Defaults to `Content`. */
  group?: string;
  /** Lucide icon name, e.g. `arrow-right-left`. See https://lucide.dev/icons. */
  icon?: IconName;
  /**
   * Position in the sidebar, lowest first. Collections sit at 10, media at 15, globals at 20, pages default to 30.
   * Equal orders keep their definition order: host pages after plugin pages.
   * Sections appear in the order of their first entry.
   */
  order?: number;
};

/** A custom admin page. */
export type Page = {
  /** Sidebar entry. Pages without one stay out of the sidebar, e.g. detail routes with params. */
  menu?: Menu;
  /**
   * Path under the admin path. Defaults to `/<key>`. `/` is the start page. Params work: `/reports/:id`.
   *
   * A page on a built-in path, e.g. `/collections/posts`, replaces the built-in view.
   */
  route?: `/${string}`;
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
   * Sidebar entry of the media library. `label`, `group`, `icon` and `order` replace its defaults
   * (`Media`, `Content`, `image`, 15).
   * @example
   * media: { group: 'Assets', icon: 'images' }
   */
  media?: Partial<Menu>;
  /**
   * Inputs by custom field type. The key `color` handles fields with `type: 'custom:color'`.
   * @example
   * fields: { color: renderVue(ColorInput) }
   */
  fields?: Record<string, Mount<FieldContext>>;
  /**
   * Extra pages by key.
   * @example
   * pages: { stats: { menu: { label: 'Stats', icon: 'chart-bar' }, mount: renderVue(Stats) } }
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
 *   pages: { stats: { menu: { label: 'Stats' }, mount: renderVue(Stats) } },
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
