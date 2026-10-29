import { Notice } from "./notice.ts";
import { clientRef } from "tenoncms/admin";
import { defineCollection, defineGlobal, definePlugin, type LocalApi } from "tenoncms";

export type ExampleOptions = {
  /** Path of the admin, as set in the adapter. Default `/admin`. */
  admin?: string;
  /* The renderer in this example to use for the admin interface. (see example/admin/) */
  renderer?: "react" | "vue" | "html";
};

// Just an example of how to use different renderers for the admin interface.
// Obviosuly you wouldn't do that in reality
const renderers = {
  html: {
    field: clientRef("tenoncms/plugins/example/admin/html#mountRatingField"),
    stats: clientRef("tenoncms/plugins/example/admin/html#mountStats"),
    quote: clientRef("tenoncms/plugins/example/admin/html#mountQuote"),
    header: clientRef("tenoncms/plugins/example/admin/html#statsHeader"),
  },
  vue: {
    field: clientRef("tenoncms/plugins/example/admin/vue#mountRatingField"),
    stats: clientRef("tenoncms/plugins/example/admin/vue#mountStats"),
    quote: clientRef("tenoncms/plugins/example/admin/vue#mountQuote"),
    header: clientRef("tenoncms/plugins/example/admin/vue#statsHeader"),
  },
  react: {
    field: clientRef("tenoncms/plugins/example/admin/react#mountRatingField"),
    stats: clientRef("tenoncms/plugins/example/admin/react#mountStats"),
    quote: clientRef("tenoncms/plugins/example/admin/react#mountQuote"),
    header: clientRef("tenoncms/plugins/example/admin/react#statsHeader"),
  },
};

// Apart from `renderers`, because the scan treats everything that the admin bar uses as site code, and
// the bar MUST NOT load the page entries (they have CSS).
const counts = {
  html: clientRef("tenoncms/plugins/example/admin/html/bar#mountCount"),
  vue: clientRef("tenoncms/plugins/example/admin/vue/bar#mountCount"),
  react: clientRef("tenoncms/plugins/example/admin/react/bar#mountCount"),
};

/**
 * A quotes plugin that uses every plugin option once. Copy it to start your own.
 * @example
 * defineCms({ plugins: [example()] })
 */
export function ExamplePlugin({ admin = "/admin", renderer = "html" }: ExampleOptions = {}) {
  const mount = renderers[renderer];
  let changes = 0;

  return definePlugin({
    name: "example",
    collections: {
      quotes: defineCollection({
        label: { en: "Quotes", de: "Zitate" },
        titleField: "text",
        nav: { group: { en: "Example", de: "Beispiel" }, icon: "quote" },
        fields: {
          text: {
            type: "textarea",
            required: true,
            hooks: { beforeValidate: [({ value }) => value?.trim()] },
          },
          author: { type: "text", default: "Anonymous" },
          notes: { type: "richtext", allowed: ["bold", "italic", "link", "exampleNotice"] },
          rating: { type: "custom:rating" },
        },
      }),
    },
    globals: {
      quoteSettings: defineGlobal({
        label: { en: "Quotes", de: "Zitate" },
        description: {
          en: "Settings for the quotes plugin",
          de: "Einstellungen des Zitate-Plugins",
        },
        nav: {
          display: "settings",
          group: { en: "Example", de: "Beispiel" },
          icon: "quote",
        },
        fields: {
          prefix: {
            type: "text",
            default: "Quote of the day",
            description: {
              en: "When requesting a random comment, this will be prefixed",
              de: "Steht vor einem zufällig abgefragten Zitat",
            },
          },
        },
      }),
    },
    // Runs for every collection and global, after their own hooks.
    // Counts saved changes for the stats page.
    hooks: {
      afterChange: [
        () => {
          changes++;
        },
      ],
    },
    // Runs for every request under /_tenon, before any route.
    // Adds an `x-example` header to the response.
    publicMiddleware: async (c, next) => {
      await next();
      c.header("x-example", "1");
    },
    // Runs for requests with a session, after the CSRF and session checks.
    // Logs every write with the name of the user.
    middleware: async (c, next) => {
      await next();
      if (c.req.method !== "GET")
        console.info(`[example plugin] ${c.req.method} ${c.req.path} by ${c.var.user.name}`);
    },

    // Mounted at /_tenon/example, open to everyone.
    publicRoutes: (api) =>
      // `GET /random` returns a random quote as text, with the prefix from the settings.
      api.get("/random", async (c) => {
        const quote = await randomQuote(c.var.cms);
        if (!quote) return c.notFound();

        const prefix = (await c.var.cms.getGlobal("quoteSettings")).prefix ?? "Quote of the day";

        return c.text(`${prefix}: “${quote.text}” (${quote.author})`);
      }),

    // Mounted at /_tenon/example, signed-in users only.
    routes: (api) =>
      // `GET /quotes.csv` downloads all quotes as a CSV file.
      api.get("/quotes.csv", async (c) => {
        const quotes = await c.var.cms.find("quotes");
        const rows = quotes.map((q) => [q.text, q.author, q.rating ?? ""].map(csv).join(","));

        return c.body(["text,author,rating", ...rows, ""].join("\n"), 200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="quotes.csv"',
        });
      }),
    admin: {
      richtext: {
        extensions: {
          exampleNotice: {
            schema: Notice,
            client: clientRef("tenoncms/plugins/example/admin/richtext#notice"),
          },
        },
      },
      fields: {
        rating: { mount: mount.field },
      },
      pages: {
        "quote-stats": {
          title: { en: "Quote stats", de: "Zitat-Statistik" },
          nav: { icon: "chart-bar", display: "main" },
          load: async ({ cms }) => {
            const quotes = await cms.find("quotes", { populate: false });
            return {
              count: quotes.length,
              changes,
              ratings: [1, 2, 3, 4, 5].map(
                (n) => quotes.filter((q) => q.rating === String(n)).length,
              ),
              quotes: quotes.map(({ id, text, author, rating }) => ({ id, text, author, rating })),
            };
          },
          pageHeader: mount.header,
          mount: mount.stats,
        },
        quote: {
          route: "/example/quotes/:id",
          nav: { display: "none" },
          mount: mount.quote,
        },
      },
      adminBar: {
        items: {
          "quote-stats": {
            label: { en: "Quote stats", de: "Zitat-Statistik" },
            icon: "chart-bar",
            order: 40,
            href: `${admin}/quote-stats`,
          },
          "latest-quotes": {
            label: { en: "Latest quotes", de: "Neueste Zitate" },
            icon: "quote",
            order: 41,
            load: async ({ cms }) => ({
              children: Object.fromEntries(
                (await cms.find("quotes", { limit: 5, select: { text: true } })).map((q) => [
                  `quote-${q.id}`,
                  { label: q.text, href: `${admin}/example/quotes/${encodeURIComponent(q.id)}` },
                ]),
              ),
            }),
          },
          "quote-count": {
            label: { en: "Quote count", de: "Anzahl der Zitate" },
            order: 43,
            load: async ({ cms }) => (await cms.find("quotes", { populate: false })).length,
            mount: counts[renderer],
          },
        },
      },
    },
  });
}

async function randomQuote(cms: LocalApi) {
  const quotes = await cms.find("quotes", { select: { text: true, author: true } });
  return quotes[Math.floor(Math.random() * quotes.length)];
}

const csv = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
