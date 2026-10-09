import { Hono } from "hono";
import { z } from "zod";
import type { AdminBarItemDescriptor } from "../../admin/index.d.ts";
import { adminBrand } from "../../admin/merge/merge-options.ts";
import type { AdminBar } from "../../admin/merge/merge-bar.ts";
import { FAILED, loadBarItem } from "../../admin/load/bar-item.ts";
import type { ResolvedBarItem } from "../../admin/load/resolve-bar-item.ts";
import { isPageUrl } from "../../admin/load/load-request.ts";
import { caller } from "../../auth/get-caller.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { builtIns, composeItems } from "../runtime/admin-bar-items.ts";

const query = z.object({
  url: z.string().refine(isPageUrl),
  mode: z.enum(["site", "preview-tab"]),
});

/**
 * `GET /admin-bar?url=&mode=` answers `{ position, items, branding }` for the page at `url`. Mount it behind the
 * session middleware.
 *
 * - `preview-tab`: the fixed preview controls. No loader runs.
 * - `site`: the built-in items with the registered ones merged in by id, sorted by `order`. A hidden item is
 *   removed first, so its loader never runs. The other loaders run in parallel with the caller's user and
 *   perspective. An item that hides itself or fails is left out, and never breaks the bar.
 *
 * `url` comes from the browser. Core only passes it to the loaders.
 */
export function adminBarEndpoint(core: Core, bar: AdminBar) {
  return new Hono<Env>().get("/admin-bar", async (c) => {
    const parsed = query.safeParse(c.req.query());
    if (!parsed.success) return c.json({ message: z.prettifyError(parsed.error) }, 400);
    const { url, mode } = parsed.data;
    const { position } = bar;
    const branding = adminBrand(core.admin.descriptor);
    if (mode === "preview-tab") return c.json({ position, items: builtIns(mode), branding });

    const { user, perspective } = await caller(core.getSession, c.req.raw);
    if (!user) return c.json({ message: "Unauthorized" }, 401);
    const ctx = { user, cms: core.localApi(outerScope(user, perspective)), url };
    const effective = composeItems<AdminBarItemDescriptor>(builtIns(mode), bar.items).filter(
      (item) => !item.hidden,
    );
    const loaded = await Promise.all(effective.map((item) => loadBarItem(item, bar.loaders, ctx)));
    const items = loaded.filter((item): item is ResolvedBarItem => !!item && item !== FAILED);
    return c.json({ position, items, branding });
  });
}
