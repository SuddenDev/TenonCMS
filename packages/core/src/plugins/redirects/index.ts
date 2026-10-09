import { clientRef } from "integral-cms/admin";
import { defineCollection, definePlugin } from "../../index.ts";
import type { LocalApi } from "../../schema/index.ts";

export type RedirectsOptions = {
  /** Collections whose documents get a redirect from their old path when it changes. Default `['pages']`. */
  collections?: string[];
  /** Name of the path field in those collections. Default `'path'`. */
  field?: string;
};

/** A redirect as {@link resolveRedirect} returns it. */
export type Redirect = { to: string; status: 301 | 302 };

/**
 * Redirects from old paths to new ones, edited in the admin and created on their own when a page moves.
 *
 * Adds the `redirects` collection (`from`, `to`, `permanent`), a hook that keeps redirects in step with
 * path changes, `GET /api/cms/redirects/lookup?path=` for everyone and `POST /api/cms/redirects/import`
 * for admins. Resolve them in your own middleware with {@link resolveRedirect}.
 * @example
 * defineCms({ plugins: [redirects()] })
 */
export function redirects({ collections = ["pages"], field = "path" }: RedirectsOptions = {}) {
  return definePlugin({
    name: "redirects",
    admin: {
      pages: {
        "redirects-tools": {
          title: "Redirect tools",
          nav: { icon: "arrow-right-left", order: 11 },
          mount: clientRef("integral-cms/plugins/redirects/admin#mountTools"),
        },
      },
    },
    collections: {
      redirects: defineCollection({
        label: "Redirects",
        titleField: "from",
        fields: {
          from: {
            type: "text",
            required: true,
            unique: true,
            pattern: "/\\S*",
            description: "Old path, e.g. /old-page",
          },
          to: {
            type: "text",
            required: true,
            pattern: "(/|https?://)\\S*",
            description: "New path, e.g. /new-page, or an http(s) URL",
          },
          permanent: { type: "boolean", default: true, description: "301 instead of 302" },
        },
      }),
    },
    hooks: {
      afterChange: [
        async ({ collection, doc, previousDoc, cms }) => {
          if (!collection || !collections.includes(collection)) return;
          const from = previousDoc?.[field];
          const to = doc[field];
          if (typeof from !== "string" || typeof to !== "string" || from === to) return;
          // Redirects that pointed at the old path follow it, so a chain stays one hop.
          for (const r of await cms.find("redirects", { where: { to: from } })) {
            if (r.from === to) await cms.delete("redirects", r.id);
            else await cms.update("redirects", r.id, { to });
          }
          const existing = await cms.findOne("redirects", { where: { from } });
          if (existing) await cms.update("redirects", existing.id, { to });
          else await cms.create("redirects", { from, to, permanent: true });
        },
      ],
    },
    routes: (api) =>
      // Creates one redirect per row. Rows are validated like documents; the first invalid one stops the import
      // and the rows before it stay.
      api.post("/import", async (c) => {
        const rows: unknown = await c.req.json().catch(() => undefined);
        if (!Array.isArray(rows)) return c.json({ message: "Expected an array of redirects" }, 400);
        for (const row of rows) await c.var.cms.create("redirects", row);
        return c.json({ count: rows.length }, 201);
      }),
    publicRoutes: (api) =>
      api.get("/lookup", async (c) => {
        const path = c.req.query("path");
        if (!path) return c.json({ message: "Missing path" }, 400);
        const redirect = await resolveRedirect(c.var.cms, path);
        return redirect ? c.json(redirect) : c.notFound();
      }),
  });
}

/**
 * Where `path` redirects to, or `undefined`. For the host's middleware:
 * @example
 * const redirect = await resolveRedirect(cms, url.pathname)
 * if (redirect) return Response.redirect(new URL(redirect.to, url), redirect.status)
 */
export async function resolveRedirect(
  cms: Pick<LocalApi, "findOne">,
  path: string,
): Promise<Redirect | undefined> {
  const doc = await cms.findOne("redirects", { where: { from: path } });
  return doc && { to: String(doc.to), status: doc.permanent === false ? 302 : 301 };
}
