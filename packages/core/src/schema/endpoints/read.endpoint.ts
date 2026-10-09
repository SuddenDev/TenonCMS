import type { AdminDescriptor } from "../../admin/index.d.ts";
import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Schema } from "../index.ts";

/**
 * Serves the schema as JSON on `GET /schema`, for the admin. It is serialized once, without hooks or other functions.
 * @returns A Hono sub-app with the one route.
 */
export function readEndpoint(
  schema: Schema,
  media?: { regenerate: boolean },
  site?: string,
  admin?: AdminDescriptor,
) {
  const publicSchema = JSON.parse(JSON.stringify(schema, publicValue));
  // What the admin needs to know of the media options.
  if (media) publicSchema.media = { regenerate: media.regenerate };
  publicSchema.admin = admin;
  if (site) publicSchema.site = site;

  return new Hono<Env>().get("/schema", (c) => c.json(publicSchema));
}

// Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
// A field MAY be named `hooks` or `preview`; it has a `type`. `JSON.stringify` drops other functions, like `validate`, itself.
// The admin only needs to know that a `preview` exists, so either form is sent as `true`.
function publicValue(key: string, value: any) {
  if (typeof value?.type === "string") return value;
  if (key === "hooks") return undefined;
  if (key === "preview") return !!value || undefined;
  return value;
}
