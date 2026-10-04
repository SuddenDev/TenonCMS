import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Schema } from "../index.ts";

export function readEndpoint(schema: Schema, media?: { regenerate: boolean }, site?: string) {
  // Hooks are functions. `JSON.stringify` turns them into `null` inside arrays, so they are dropped here.
  // A field MAY be named `hooks` or `preview`; it has a `type`. `JSON.stringify` drops other functions, like `validate`, itself.
  // The admin only needs to know that a `preview` exists, so either form is sent as `true`.
  const publicSchema = JSON.parse(
    JSON.stringify(schema, (key, value) =>
      typeof value?.type === "string"
        ? value
        : key === "hooks"
          ? undefined
          : key === "preview"
            ? !!value || undefined
            : value,
    ),
  );
  // What the admin needs to know of the media options.
  if (media) publicSchema.media = { regenerate: media.regenerate };
  if (site) publicSchema.site = site;

  return new Hono<Env>().get("/schema", (c) => c.json(publicSchema));
}
