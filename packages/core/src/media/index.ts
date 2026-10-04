import type { Core, Scope } from "../cms/scope.ts";
import type { MediaApi, MediaHooks, Modifiers } from "../schema/index.ts";
import type { ImageProvider } from "./images.ts";
import { removeMedia, renameFolder, update } from "./library.ts";
import type { Storage } from "./storage/types.ts";
import { upload } from "./upload.ts";
import { regenerate } from "./variants.ts";

// The media library. Start here: the options, the reserved collection, and `cms.media`, whose methods lead to
// `upload.ts` (uploads), `library.ts` (edits, moves, deletes) and `variants.ts` (rendered images).
// `core.ts` resolves the options and holds what every operation shares; `http.ts` maps the routes onto the same functions.

export type { ImageProvider } from "./images.ts";
export type { Storage } from "./storage/types.ts";

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
  drafts: false,
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

/** `cms.media` of one scope. */
export const mediaApi = (core: Core, scope: Scope) =>
  ({
    upload: (data, info) => upload(core, scope, data, info),
    update: (id, data) => update(core, scope, id, data),
    renameFolder: (from, to) => renameFolder(core, scope, from, to),
    delete: (id) => removeMedia(core, scope, id),
    regenerate: (id, options) => regenerate(core, scope, id, options),
  }) satisfies MediaApi as MediaApi;
