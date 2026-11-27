import type { AuthOptions } from "../../auth/config/options.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { MediaHooks, Modifiers, Schema } from "../../schema/index.ts";
import type { ImageOptions } from "../../schema/fields/image.ts";
import { pathKey, relationPaths } from "../../schema/traversal/relation-paths.ts";
import { allowlist } from "../images/allowlist.ts";
import { DEFAULT_SIZES } from "../images/modifiers.ts";
import type { Images } from "../images/types.ts";
import type { ImagesOptions, MediaOptions } from "../config/options.ts";
import type { Storage } from "../storage/types.ts";

const MB = 1024 ** 2;

/** The `site.url` origin and `auth.baseURL` of the host. */
type HostOrigins = { siteUrl?: string; baseURL?: AuthOptions["baseURL"] };

/** What core needs of the `media` option, with defaults. */
export type MediaCore = {
  storage: Storage;
  maxSize: number;
  accept?: string[];
  images?: Images;
  /** Modifiers the `/img` route accepts, by modifier id. */
  allowlist: Map<string, Modifiers>;
  hooks: MediaHooks;
  /** The CMS origin that relative media URLs get on read. `undefined` keeps them relative. */
  origin?: string;
};

/**
 * Resolves the `media` option with its defaults.
 * @throws For an unknown preset or a `prerender` provider without `render`.
 */
export function createMediaCore(
  options: MediaOptions,
  schema: Required<Schema>,
  origins: HostOrigins = {},
): MediaCore {
  const images = options.images ? withDefaults(options.images) : undefined;
  const fields = imageFields(schema);

  if (images?.provider.prerender && !images.provider.render)
    fail("media.images.provider has `prerender` but no `render`");
  for (const { path, image } of fields) {
    if (image?.preset && !Object.hasOwn(images?.presets ?? {}, image.preset))
      fail(`image "${path}" uses unknown preset "${image.preset}"`);
  }

  const fieldOptions = fields.map((f) => f.image);

  return {
    storage: options.storage,
    maxSize: options.maxSize ?? 100 * MB,
    accept: options.accept,
    images,
    allowlist: images ? allowlist(images, fieldOptions) : new Map(),
    hooks: options.hooks ?? {},
    origin: cmsOrigin(origins),
  };
}

/**
 * The CMS origin when the site is on another one: `site.url` is set, `auth.baseURL` is a fixed URL, and their origins
 * differ. An embedded host or a dynamic base URL gets `undefined`, so its media URLs stay relative.
 */
function cmsOrigin({ siteUrl, baseURL }: HostOrigins) {
  if (!siteUrl || typeof baseURL !== "string") return undefined;
  const origin = new URL(baseURL).origin;
  return origin === siteUrl ? undefined : origin;
}

/** The media core, or an error for an instance without `media`. */
export function mediaOf(core: Core): MediaCore {
  if (!core.media) throw new Error("tenoncms: the `media` option is not set");
  return core.media;
}

function withDefaults(images: ImagesOptions): Images {
  return {
    format: "webp",
    quality: 85,
    sizes: DEFAULT_SIZES,
    presets: {},
    maxSize: 50 * MB,
    ...images,
  };
}

// Every `image` field of the schema, in collections and globals.
function imageFields(schema: Required<Schema>): { path: string; image?: ImageOptions }[] {
  const owners = [...Object.values(schema.collections), ...Object.values(schema.globals)];
  return owners.flatMap((owner) =>
    relationPaths(owner.fields).flatMap(({ path, field }) =>
      field.type === "image" ? [{ path: pathKey(path), image: field.image }] : [],
    ),
  );
}

function fail(message: string): never {
  throw new Error(`tenoncms: ${message}`);
}
