import { defineAdmin, type PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { redirectsAdmin } from "integral-cms/plugins/redirects/admin";

const client = createClient();

// Content and URL parts are untrusted. Escape everything that lands in innerHTML.
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Plain DOM. Any framework can mount into `el` the same way.
export default defineAdmin({
  name: "Example site",
  media: { group: "Blog", icon: "images" },
  plugins: [redirectsAdmin()],
  fields: {
    color(el, { value, onChange }) {
      const input = Object.assign(document.createElement("input"), {
        type: "color",
        value: value ?? "#000000",
      });
      input.oninput = () => onChange(input.value);
      el.append(input);
      return () => input.remove();
    },
  },
  pages: {
    stats: {
      menu: { label: "Stats", icon: "chart-bar" },
      mount(el, { integral }) {
        client.find("posts").then((posts) => {
          el.innerHTML = `<h1 class="text-2xl font-semibold">Stats</h1>
            <p class="mt-2 text-sm text-zinc-600">${posts.length} post(s)</p>
            <ul class="mt-4 flex flex-col gap-1 text-sm">
              ${posts.map((p) => `<li><a class="underline" href="${integral.base}/reports/posts/${esc(p.id)}?tab=body">${esc(p.title)}</a></li>`).join("")}
            </ul>`;
        });
        return () => (el.innerHTML = "");
      },
    },
    dashboard: {
      route: "/",
      mount: (el, { integral }) => {
        const render = async () => {
          const posts = await client.find("posts");
          const session = await client.getSession();
          el.innerHTML = `<h1 class="text-2xl font-semibold">Hi, ${session?.user.name ?? "Guest"}</h1>
            <p class="mt-2 text-sm text-zinc-600">${posts.length} post(s)</p>
            <ul class="mt-4 flex flex-col gap-1 text-sm">
              ${posts.map((p) => `<li><a class="underline" href="${integral.base}/reports/posts/${esc(p.id)}?tab=body">${esc(p.title)}</a></li>`).join("")}
            </ul>`;
        };
        render();
        return () => (el.innerHTML = "");
      },
    },
    // No menu: reachable from the Stats page, not the sidebar.
    // `update` runs on every route change, so the page refetches when `:id` or `?tab` changes.
    post: {
      mount(el, ctx) {
        const render = async ({ params, query }: PageContext) => {
          const post = await client.findById("posts", String(params.id));
          el.innerHTML = `<h1 class="text-2xl font-semibold">${esc(post.title)}</h1>
            <p class="mt-2 text-sm text-zinc-600">id ${esc(params.id)}, tab ${esc(query.tab ?? "none")}</p>
            ${query.tab === "body" ? `<pre class="mt-4 text-sm">${esc(post.body)}</pre>` : ""}`;
        };
        render(ctx);
        return { update: render, unmount: () => (el.innerHTML = "") };
      },
      route: "/reports/posts/:id",
    },
  },
});
