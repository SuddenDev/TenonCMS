import type { LocalApi } from "../../cms/api/local-api.ts";

/**
 * Where the live preview opens a document, relative to the site origin.
 * - A template with `{dot.path}` placeholders. A placeholder walks into groups and through one relation, whose
 *   target is read with `findById`. A value that is missing or empty means no preview.
 * - A function of the unsaved form state and `{ cms, locale }`, the local API and the document's locale. `null` means no preview for this document.
 * @example
 * permalink: '/posts/{slug}'
 * permalink: '/{category.slug}/{slug}'
 * permalink: (doc) => (doc.slug ? `/posts/${doc.slug}` : null)
 */
export type Preview =
  | string
  | ((
      doc: Record<string, unknown>,
      ctx: { cms: LocalApi; locale?: string },
    ) => string | null | Promise<string | null>);

/** Unsaved form state by `<collection>:<id>`. Globals are keyed `<name>:`. */
export type Drafts = Record<string, Record<string, unknown>>;
/** Stops what a call started. */
export type Unsubscribe = () => void;

/** Messages between the admin and the site, sent with `postMessage`. */
export type PreviewMessage =
  | { type: "ready" }
  | {
      type: "draft";
      collection: string;
      id: string;
      data: Record<string, unknown>;
      /** The locale of the edited document. A draft applies only to page data of the same locale. */
      locale?: string;
    }
  | { type: "mode"; edit: boolean }
  | { type: "highlight"; collection: string | null; id: string | null }
  | { type: "edit"; collection: string; id: string; path: string }
  | { type: "url"; href: string }
  | { type: "documents"; documents: { collection: string; id: string }[] }
  | { type: "saved"; collection: string; id: string; locale?: string };

/** Options of `preview()`. */
export type PreviewOptions = {
  /**
   * Re-renders the page on a `saved` message: fetches the current URL and morphs `<body>` and the title.
   * Server-rendered sites without client data (Astro) need it. Defaults to `false`.
   */
  morph?: boolean;
  /**
   * The admin path, for the bars' links. Its origin is the only one the live preview trusts, so an admin on another
   * origin needs a full URL, like `https://cms.example.com/admin`. `false` renders no admin bar. Defaults to `/admin`.
   */
  admin?: string | false;
};
