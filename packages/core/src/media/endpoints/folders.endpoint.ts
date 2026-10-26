import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { folders } from "../operations/folders.operation.ts";
import { renameFolder } from "../operations/rename-folder.operation.ts";
import { body, scope } from "./request-context.ts";

/** `GET /folders`: the folders of the files the caller MAY read. */
export function foldersReadEndpoints(core: Core) {
  return new Hono<Env>().get("/folders", async (c) => c.json(await folders(core, scope(c))));
}

/** Protected `POST /folders/rename`. */
export function foldersWriteEndpoints(core: Core) {
  const api = new Hono<Env>();
  api.post("/folders/rename", async (c) => {
    const { from, to } = await body(c.req);
    return c.json(await renameFolder(core, scope(c), String(from ?? ""), String(to ?? "")));
  });
  return api;
}
