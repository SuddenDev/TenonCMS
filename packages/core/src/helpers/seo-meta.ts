// Helpers run in browser bundles too, so this file MUST have no imports.

/** A populated media document has a `url`; an unpopulated id string does not. */
type Image = unknown;

type SeoDoc = {
  title?: unknown;
  path?: unknown;
  locale?: unknown;
  /** The `alternates` metadata of a read with `alternates: true`. */
  alternates?: Record<string, string> | null;
  seo?: {
    title?: string | null;
    description?: string | null;
    noindex?: boolean | null;
    image?: Image;
  } | null;
};

/** The `general` and `seo` globals, as read from the local API or the client. */
type SeoSettings = {
  general?: { title?: string | null; url?: string | null } | null;
  seo?: {
    separator?: string | null;
    image?: Image;
    verification?: { google?: string | null; bing?: string | null } | null;
    noindex?: boolean | null;
  } | null;
};

const join = (base: string, path: string) => base.replace(/\/$/, "") + path;

// Absolute against `base` when it is set.
const absolute = (url: string, base?: string) => (base ? new URL(url, base).href : url);

function urlOf(image: Image) {
  const url = (image as { url?: unknown } | null | undefined)?.url;
  return typeof url === "string" && url ? url : undefined;
}

/**
 * The `<head>` values of a document with `seo().fields`. Stores nothing.
 * - `title`: `seo.title`, or the document's `title` when it is empty, so the fallback follows title changes. With `general.title`, it follows after `seo.separator` (default `" · "`).
 * - `description`: `seo.description`, or `undefined`. There is no fallback.
 * - `noindex`: `true` when the document's or the site's `seo.noindex` is `true`.
 * - `canonical`: the URL of the document's own locale in `alternates`, else `general.url` joined with the document's `path`. `undefined` unless one of them exists.
 * - `alternates`: `{ hreflang, href }[]` for the `<link rel="alternate">` tags, from `doc.alternates` (`x-default` included). Absolute against `general.url` when it is set. Empty without `doc.alternates`.
 * - `image`: URL of the document's `seo.image`, else of the site's. Absolute against `general.url` when it is set. Only a populated media document counts; an id string is ignored.
 * - `verification`: `{ name, content }` meta tags for the filled `seo.verification` fields.
 */
export function seoMeta(doc: SeoDoc, settings: SeoSettings = {}) {
  const { general, seo } = settings;
  const site = general?.title;
  const base = general?.url || undefined;
  const page = doc.seo?.title || String(doc.title ?? "");
  const image = urlOf(doc.seo?.image) ?? urlOf(seo?.image);
  const path = typeof doc.path === "string" && doc.path ? doc.path : undefined;
  const { google, bing } = seo?.verification ?? {};
  const alternates = Object.entries(doc.alternates ?? {}).map(([hreflang, href]) => ({
    hreflang,
    href: base && href.startsWith("/") ? join(base, href) : href,
  }));
  const own = alternates.find((a) => a.hreflang === doc.locale)?.href;

  return {
    title: site ? page + (seo?.separator ?? " · ") + site : page,
    description: doc.seo?.description || undefined,
    noindex: doc.seo?.noindex === true || seo?.noindex === true,
    canonical: own ?? (base && path ? join(base, path) : undefined),
    alternates,
    image: image && absolute(image, base),
    verification: [
      google && { name: "google-site-verification", content: google },
      bing && { name: "msvalidate.01", content: bing },
    ].filter((tag) => !!tag),
  };
}
