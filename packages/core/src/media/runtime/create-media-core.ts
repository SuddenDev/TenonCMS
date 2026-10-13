import type { Core } from "../../cms/runtime/types.ts";
import type { MediaHooks, Modifiers, Schema } from "../../schema/index.ts";
import type { ImageOptions } from "../../schema/fields/image.ts";
import { pathKey, relationPaths } from "../../schema/traversal/relation-paths.ts";
import { allowlist } from "../images/allowlist.ts";
import type { Images } from "../images/types.ts";
import type { ImagesOptions, MediaOptions } from "../config/options.ts";
import type { Storage } from "../storage/types.ts";

const MB = 1024 ** 2;

/** What core needs of the `media` option, with defaults. */
export type MediaCore = {
  storage: Storage;
  maxSize: number;
  accept?: string[];
  images?: Images;
  /** Modifiers the `/img` route accepts, by modifier id. */
  allowlist: Map<string, Modifiers>;
  hooks: MediaHooks;
};

/**
 * Resolves the `media` option with its defaults.
 * @throws For an unknown preset or a `prerender` provider without `render`.
 */
export function createMediaCore(options: MediaOptions, schema: Required<Schema>): MediaCore {
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
  };
}

/** The media core, or an error for an instance without `media`. */
export function mediaOf(core: Core): MediaCore {
  if (!core.media) throw new Error("integral-cms: the `media` option is not set");
  return core.media;
}

function withDefaults(images: ImagesOptions): Images {
  return {
    format: "webp",
    quality: 85,
    sizes: [320, 640, 1024, 1536, 1920],
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
  throw new Error(`integral-cms: ${message}`);
}
