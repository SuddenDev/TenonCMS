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

/** A custom admin page. */
export type Page = {
  /** Sidebar label. Pages without one stay out of the sidebar, e.g. detail routes with params. */
  label?: string;
  /**
   * Path under the admin path. Defaults to `/<key>`. `/` is the start page. Params work: `/reports/:id`.
   *
   * A page on a built-in path, e.g. `/collections/posts`, replaces the built-in view.
   */
  route?: `/${string}`;
  /** Renders the page. */
  mount: Mount<PageContext>;
};

/** Admin customization. Default export of `integral.admin.ts`. */
export type AdminOptions = {
  /**
   * Inputs by custom field type. The key `color` handles fields with `type: 'custom:color'`.
   * @example
   * fields: { color: renderVue(ColorInput) }
   */
  fields?: Record<string, Mount<FieldContext>>;
  /**
   * Extra pages by key.
   * @example
   * pages: { stats: { label: 'Stats', mount: renderVue(Stats) } }
   */
  pages?: Record<string, Page>;
};

/**
 * Types the admin options. Use it as the default export of `integral.admin.ts`.
 * @example
 * export default defineAdmin({
 *   fields: { color: renderVue(ColorInput) },
 *   pages: { stats: { label: 'Stats', mount: renderVue(Stats) } },
 * })
 */
export function defineAdmin(options: AdminOptions): AdminOptions;

/**
 * Mounts the admin into `el` and returns an unmount function.
 *
 * Astro, Nuxt and `integral-cms/vite` call it for you on the admin path. Elsewhere, call it on a page of its own:
 * the admin's styles are global and stay after unmount.
 * @param el Element or CSS selector.
 * @param options Usually the default export of `integral.admin.ts`.
 * @param base Path the admin is served at. Defaults to `/admin`.
 */
export function mountAdmin(el: string | Element, options?: AdminOptions, base?: string): () => void;
