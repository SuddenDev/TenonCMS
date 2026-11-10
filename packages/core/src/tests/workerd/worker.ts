import { defineCms, defineTask } from "../../index.ts";
import { durableObject, tenonObject } from "../../integrations/cloudflare/index.ts";

export const cms = defineCms({
  database: durableObject(),
  secret: "workerd-test-secret-workerd-test-secret",
  jobs: {
    scheduledTasks: { "* * * * *": ["tick"] },
    tasks: {
      tick: defineTask({ run: () => {} }),
      log: defineTask({
        run: async ({ cms, payload }) =>
          void (await cms.create("logs", { message: String(payload) })),
      }),
    },
  },
  collections: {
    authors: { fields: { name: { type: "text" } } },
    posts: {
      fields: {
        title: { type: "text", required: true },
        featured: { type: "boolean" },
        author: { type: "relation", collection: "authors", onDelete: "restrict" },
        contributors: { type: "relation", collection: "authors", many: true },
      },
      hooks: {
        afterChange: [
          async ({ cms, doc }) => void (await cms.create("logs", { message: doc.title })),
          async ({ doc }) => {
            // Non-storage I/O while the write is still open.
            await new Promise((resolve) => setTimeout(resolve, 5));
            if (doc.title === "fail") throw new Error("forced failure");
          },
        ],
      },
    },
    // A relation inside blocks, for reference scans over `json_each`.
    pages: {
      fields: {
        sections: {
          type: "blocks",
          blocks: {
            quote: {
              fields: {
                text: { type: "text" },
                by: { type: "relation", collection: "authors", onDelete: "restrict" },
              },
            },
          },
        },
      },
    },
    logs: { fields: { message: { type: "text" } } },
  },
});

export const CmsObject = tenonObject(cms);

export default {
  fetch: (request, env) => env.CMS.getByName("cms").fetch(request),
} satisfies ExportedHandler<Cloudflare.Env>;
