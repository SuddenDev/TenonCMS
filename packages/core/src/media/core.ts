import { col, type Core, hookArgs, type Inner } from "../cms/scope.ts";
import { list, runHooks } from "../schema/hooks/run.ts";
import type { MediaDoc, MediaHooks, Modifiers, Schema } from "../schema/index.ts";
import { relationPaths } from "../schema/walk.ts";
import { allowlist, decorate, type Images } from "./images.ts";
import type { MediaOptions } from "./config/options.ts";
import type { Storage } from "./storage/types.ts";

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

function fail(message: string): never {
  throw new Error(`integral-cms: ${message}`);
}

/** Resolves the `media` option. Throws for an unknown preset or a `prerender` provider without `render`. */
export function createMediaCore(options: MediaOptions, schema: Required<Schema>): MediaCore {
  const images: Images | undefined = options.images
    ? {
        format: "webp",
        quality: 85,
        sizes: [320, 640, 1024, 1536, 1920],
        presets: {},
        maxSize: 50 * MB,
        ...options.images,
      }
    : undefined;
  if (images?.provider.prerender && !images.provider.render)
    fail("media.images.provider has `prerender` but no `render`");
  const fields = imageFields(schema);
  for (const { path, image } of fields) {
    const preset = image?.preset;
    if (preset && !Object.hasOwn(images?.presets ?? {}, preset))
      fail(`image "${path}" uses unknown preset "${preset}"`);
  }
  return {
    storage: options.storage,
    maxSize: options.maxSize ?? 100 * MB,
    accept: options.accept,
    images,
    allowlist: images
      ? allowlist(
          images,
          fields.map((f) => f.image),
        )
      : new Map(),
    hooks: options.hooks ?? {},
  };
}

// Every `image` field of the schema, in collections and globals.
function imageFields(schema: Required<Schema>) {
  const owners = [...Object.values(schema.collections), ...Object.values(schema.globals)];
  return owners.flatMap((owner) =>
    relationPaths(owner.fields).flatMap(({ path, field }) =>
      field.type === "image" ? [{ path: path.join("."), image: field.image }] : [],
    ),
  );
}

/** The media core, or an error for an instance without `media`. */
export function mediaOf(core: Core): MediaCore {
  if (!core.media) throw new Error("integral-cms: the `media` option is not set");
  return core.media;
}

/** Runs the media hooks of `stage` on `value`: the host's, then each plugin's in `plugins` order. */
export function runMediaHooks<V>(
  core: Core,
  s: Inner,
  stage: keyof MediaHooks,
  key: string,
  value: V,
  extra: object = {},
): Promise<V> {
  const slot = [
    ...list<(args: any) => unknown>(core.media?.hooks[stage]),
    ...core.plugins.flatMap((p) => list<(args: any) => unknown>(p.mediaHooks?.[stage])),
  ];
  return runHooks(slot, key, value, hookArgs(s, col("media"), extra));
}

/** A media document with `url`, and `src` / `srcset` for images, with the global image options. */
export const read = (core: Core, doc: Record<string, any>) =>
  decorate(mediaOf(core), doc) as MediaDoc & { url: string };
