// Anything the host plugs into the admin. Runs once with an empty element and the context.
// Returns a cleanup, or `{ update, unmount }` to also receive context changes.
export type Mount<Ctx> = (el: HTMLElement, ctx: Ctx) => (() => void) | { update?: (ctx: Ctx) => void; unmount: () => void }

export type FieldContext = {
  name: string
  field: { type: string; label?: string; required?: boolean }
  value: any
  onChange: (value: any) => void
}

export type PageContext = {
  // Same-origin fetch against /api/cms, e.g. `api('/collections/posts')`.
  api: <T = any>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>
  // Route params, e.g. `{ id }` for `/reports/:id`.
  params: Record<string, string | string[]>
  // Query string, e.g. `{ tab: 'body' }` for `?tab=body`.
  query: Record<string, string | string[] | null | (string | null)[]>
}

export type Page = {
  // Sidebar label. Pages without one are not listed, e.g. detail routes with params.
  label?: string
  // Path under /admin, defaults to `/<key>`. `/` is the start page. Params work: `/reports/:id`.
  // A page on a built-in path, e.g. `/collections/posts`, replaces the built-in view.
  route?: `/${string}`
  mount: Mount<PageContext>
}

export type AdminOptions = {
  // Inputs by field type.
  fields?: Record<string, Mount<FieldContext>>
  // Extra pages by key.
  pages?: Record<string, Page>
}

export function defineAdmin(options: AdminOptions): AdminOptions

// Mounts the admin into `el` and returns an unmount function.
export function mountAdmin(el: string | Element, options?: AdminOptions): () => void
