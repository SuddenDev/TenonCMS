import type { AdminDescriptor } from "../../admin/index.d.ts";
import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Localization } from "../../cms/config/options.ts";
import { isObject } from "../condition.ts";
import type { Schema } from "../index.ts";

/**
 * Serves the schema as JSON on `GET /schema`, for the admin. It is serialized once, without hooks or other functions.
 * With `localization`, it adds the locales and the default locale.
 * @returns A Hono sub-app with the one route.
 */
export function readEndpoint(
  schema: Schema,
  media?: { regenerate: boolean },
  site?: string,
  admin?: AdminDescriptor,
  localization?: Localization,
) {
  const publicSchema = JSON.parse(JSON.stringify(schema, publicValue));
  for (const kind of ["collections", "globals"] as const)
    for (const [name, entry] of Object.entries(schema[kind] ?? {}))
      if (entry.permalink) publicSchema[kind][name].preview = true;
  // What the admin needs to know of the media options.
  if (media) publicSchema.media = { regenerate: media.regenerate };
  publicSchema.admin = admin;
  if (site) publicSchema.site = site;
  if (localization)
    publicSchema.localization = {
      locales: localization.locales,
      defaultLocale: localization.defaultLocale,
    };

  return new Hono<Env>().get("/schema", (c) => c.json(publicSchema));
}

// Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
// A field, or a block, collection or global with `fields`, MAY be named `hooks` or `preview`, so it passes as is.
// `JSON.stringify` drops other functions, like `validate`, itself.
// The admin only needs to know that a preview exists (`preview` or `permalink`), so either form is sent as `true`.
function publicValue(key: string, value: any) {
  if (typeof value?.type === "string" || isObject(value?.fields)) return value;
  if (key === "hooks") return undefined;
  if (key === "permalink") return undefined;
  if (key === "preview") return !!value || undefined;
  return value;
}
