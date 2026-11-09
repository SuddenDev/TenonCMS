// Helpers run in browser bundles too, so this file MUST have no imports.

/** A populated media document has a `url`; an unpopulated id string does not. */
type Image = unknown;

/** Any document. Placeholders reach all of its fields. */
type SeoDoc = Record<string, unknown> & {
  title?: unknown;
  path?: unknown;
  /** The `permalink` of a read with `permalink: true`. Wins over `path`. */
  permalink?: string | null;
  locale?: unknown;
  /** The `alternates` metadata of a read with `alternates: true`. */
  alternates?: Record<string, string> | null;
  seo?: {
    title?: string | null;
    /** `true`: `title` is the whole title. Otherwise it fills `{title}` in the title template. */
    fullTitle?: boolean | null;
    description?: string | null;
    noindex?: boolean | null;
    image?: Image;
  } | null;
};

/** Templates of one collection or global: the `templates` option of `seo()`. */
export type SeoTemplates = { title?: string | null; description?: string | null };

/** The `general` and `seo` globals, as read from the local API or the client, and the collection's templates. */
type SeoSettings = {
  templates?: SeoTemplates | null;
  general?: { title?: string | null; tagline?: string | null; url?: string | null } | null;
  seo?: {
    title?: string | null;
    description?: string | null;
    image?: Image;
    verification?: { google?: string | null; bing?: string | null } | null;
    noindex?: boolean | null;
  } | null;
};

/** The title template when neither the page, its collection nor the site sets one. */
export const DEFAULT_SEO_TITLE = "{title} · {site.title}";

// ponytail: trims separators at the ends only, so an empty placeholder in the middle leaves a double separator.
const EDGES = /^[\s·|–—\-:,]+|[\s·|–—\-:,]+$/g;

/**
 * Fills each `{dot.path}` of `template` from `context`. A missing value or one that is not a string or number
 * becomes `""`. Then separators at the ends go, and runs of spaces collapse.
 */
function fillTemplate(template: string, context: unknown) {
  const filled = template.replace(/\{([^{}]+)\}/g, (_, path: string) => {
    const value = path
      .split(".")
      .reduce<unknown>(
        (v, key) => (v && typeof v === "object" ? (v as any)[key] : undefined),
        context,
      );
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  });
  return filled.replace(/\s{2,}/g, " ").replace(EDGES, "");
}

const join = (base: string, path: string) => base.replace(/\/$/, "") + path;

// Absolute against `base` when it is set.
const absolute = (url: string, base?: string) => (base ? new URL(url, base).href : url);

function urlOf(image: Image) {
  const url = (image as { url?: unknown } | null | undefined)?.url;
  return typeof url === "string" && url ? url : undefined;
}

/**
 * The `<head>` values of a document with `seo().fields`. Stores nothing.
 *
 * `title` and `description` are templates. `{dot.path}` reads a field of the document, `{site.title}` and
 * `{site.tagline}` read the `general` global. A missing value is empty.
 * - `title`: the template is `templates.title` of the collection, else the site's `seo.title`, else
 *   {@link DEFAULT_SEO_TITLE}. The document's own `seo.title` fills its `{title}`. With `seo.fullTitle`, the own title
 *   is the whole title.
 * - `description`: the document's `seo.description`, else `templates.description`, else the site's. `undefined` when
 *   it fills to nothing.
 * - `noindex`: `true` when the document's or the site's `seo.noindex` is `true`.
 * - `canonical`: the URL of the document's own locale in `alternates`, else `general.url` joined with the document's `permalink`, else its `path`. `undefined` unless one of them exists.
 * - `alternates`: `{ hreflang, href }[]` for the `<link rel="alternate">` tags, from `doc.alternates` (`x-default` included). Absolute against `general.url` when it is set. Empty without `doc.alternates`.
 * - `image`: URL of the document's `seo.image`, else of the site's. Absolute against `general.url` when it is set. Only a populated media document counts; an id string is ignored.
 * - `verification`: `{ name, content }` meta tags for the filled `seo.verification` fields.
 */
export function seoMeta(doc: SeoDoc, settings: SeoSettings = {}) {
  const { general, seo, templates } = settings;
  const base = general?.url || undefined;
  const context = { ...doc, site: general ?? {} };
  const own = doc.seo?.title;
  const template = templates?.title || seo?.title || DEFAULT_SEO_TITLE;
  const title =
    own && doc.seo?.fullTitle
      ? fillTemplate(own, context)
      : fillTemplate(template, own ? { ...context, title: fillTemplate(own, context) } : context);
  const description = doc.seo?.description || templates?.description || seo?.description;
  const image = urlOf(doc.seo?.image) ?? urlOf(seo?.image);
  const path = doc.permalink || (typeof doc.path === "string" && doc.path ? doc.path : undefined);
  const { google, bing } = seo?.verification ?? {};
  const alternates = Object.entries(doc.alternates ?? {}).map(([hreflang, href]) => ({
    hreflang,
    href: base && href.startsWith("/") ? join(base, href) : href,
  }));
  const localUrl = alternates.find((a) => a.hreflang === doc.locale)?.href;

  return {
    title,
    description: (description && fillTemplate(description, context)) || undefined,
    noindex: doc.seo?.noindex === true || seo?.noindex === true,
    canonical: localUrl ?? (base && path ? join(base, path) : undefined),
    alternates,
    image: image && absolute(image, base),
    verification: [
      google && { name: "google-site-verification", content: google },
      bing && { name: "msvalidate.01", content: bing },
    ].filter((tag) => !!tag),
  };
}

/** A `<meta>` tag of {@link seoHead}: `name` or `property`, with `content`. */
export type SeoMetaTag = { name: string; content: string } | { property: string; content: string };

/** A `<link>` tag of {@link seoHead}. */
export type SeoLinkTag =
  | { rel: "canonical"; href: string }
  | { rel: "alternate"; hreflang: string; href: string };

/**
 * The `<head>` tags of {@link seoMeta}: description, Open Graph, the Twitter card, robots and verification as
 * `meta`, canonical and `hreflang` as `links`. Tags without a value are left out. `og:site_name` is the `general`
 * title. TanStack Router's `head()` takes `meta` and `links` as they are; unhead calls `links` `link`.
 */
export function seoHead(doc: SeoDoc, settings: SeoSettings = {}) {
  const meta = seoMeta(doc, settings);
  const tags: [kind: "name" | "property", key: string, content: string | undefined][] = [
    ["name", "description", meta.description],
    ["property", "og:title", meta.title],
    ["property", "og:description", meta.description],
    ["property", "og:image", meta.image],
    ["property", "og:url", meta.canonical],
    ["property", "og:type", "website"],
    ["property", "og:site_name", settings.general?.title || undefined],
    ["name", "twitter:card", meta.image ? "summary_large_image" : "summary"],
    ["name", "robots", meta.noindex ? "noindex, nofollow" : undefined],
  ];
  const links: SeoLinkTag[] = meta.alternates.map(({ hreflang, href }) => ({
    rel: "alternate" as const,
    hreflang,
    href,
  }));
  if (meta.canonical) links.unshift({ rel: "canonical", href: meta.canonical });

  return {
    title: meta.title,
    meta: [
      ...tags.flatMap(([kind, key, content]) =>
        content ? [{ [kind]: key, content } as SeoMetaTag] : [],
      ),
      ...meta.verification,
    ] as SeoMetaTag[],
    links,
  };
}
