import type { Core, Scope } from "../cms/scope.ts";
import { list } from "../schema/hooks/run.ts";
import type { ImageOptions, MediaApi, MediaHooks, Modifiers, Schema } from "../schema/index.ts";
import { relationPaths } from "../schema/walk.ts";
import { allowlist, type ImageProvider, type Images } from "./images.ts";
import type { Storage } from "./storage/types.ts";
import { removeMedia, renameFolder, update } from "./move.ts";
import { regenerate, upload } from "./upload.ts";

export type { ImageProvider } from "./images.ts";
export type { Storage } from "./storage/types.ts";

const MB = 1024 ** 2;

export type ImagesOptions = {
  /** Builds variant URLs: `ipx()` from `integral-cms/media/ipx`, `cloudflare()` from `integral-cms/media/cloudflare`, or your own. */
  provider: ImageProvider;
  /** Default output format. Default `'webp'`. */
  format?: string;
  /** Default output quality. Default `85`. */
  quality?: number;
  /** Widths for `srcset`. Default `[320, 640, 1024, 1536, 1920]`. */
  sizes?: number[];
  /** Named modifier sets that `image` fields pick with `image: { preset }`. */
  presets?: Record<string, Modifiers>;
  /** Images above this size in bytes get dimensions but no variants. Default 50 MB. */
  maxSize?: number;
};

export type MediaOptions = {
  /** Where files live: `local()` from `integral-cms/media/local`, `s3()` from `integral-cms/media/s3`, or your own. */
  storage: Storage;
  /** Largest accepted file in bytes. Default 100 MB. */
  maxSize?: number;
  /** Allowed MIME types, `type/*` wildcards allowed, e.g. `['image/*', 'application/pdf']`. Default: all types. */
  accept?: string[];
  /** Responsive image variants. `false` serves originals only. Default `false`. */
  images?: ImagesOptions | false;
  /** Hooks of the media library. See {@link MediaHooks}. */
  hooks?: MediaHooks;
};

/** The reserved collection of the media library. Written only through the media API. */
export const mediaCollection = {
  label: "Media",
  titleField: "filename",
  fields: {
    folder: { type: "text" },
    filename: { type: "text", required: true },
    key: { type: "text", required: true, readOnly: true },
    mimeType: { type: "text", required: true, readOnly: true },
    size: { type: "number", required: true, readOnly: true },
    width: { type: "number", readOnly: true },
    height: { type: "number", readOnly: true },
    alt: { type: "text" },
  },
} as const;

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
  const fields: (ImageOptions | undefined)[] = [];
  for (const owner of [...Object.values(schema.collections), ...Object.values(schema.globals)])
    for (const { path, field } of relationPaths(owner.fields)) {
      if (field.type !== "image") continue;
      const preset = field.image?.preset;
      if (preset && !Object.hasOwn(images?.presets ?? {}, preset))
        fail(`image "${path.join(".")}" uses unknown preset "${preset}"`);
      fields.push(field.image);
    }
  return {
    storage: options.storage,
    maxSize: options.maxSize ?? 100 * MB,
    accept: options.accept,
    images,
    allowlist: images ? allowlist(images, fields) : new Map(),
    hooks: options.hooks ?? {},
  };
}

/** The media hooks of a stage: the host's, then each plugin's in `plugins` order. */
export const mediaSlot = (core: Core, stage: keyof MediaHooks): ((args: any) => unknown)[] => [
  ...list<(args: any) => unknown>(core.media?.hooks[stage]),
  ...core.plugins.flatMap((p) => list<(args: any) => unknown>(p.mediaHooks?.[stage])),
];

/** `cms.media` of one scope. */
export const mediaApi = (core: Core, scope: Scope) =>
  ({
    upload: (data, info) => upload(core, scope, data, info),
    update: (id, data) => update(core, scope, id, data),
    renameFolder: (from, to) => renameFolder(core, scope, from, to),
    delete: (id) => removeMedia(core, scope, id),
    regenerate: (id, options) => regenerate(core, scope, id, options),
  }) satisfies MediaApi as MediaApi;
