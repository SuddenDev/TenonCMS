import type { Mount, PageContext, PageHeader } from "integral-cms/admin";
import { createClient } from "integral-cms/client";

const client = createClient();

// Content and URL parts are untrusted. Escape everything that lands in innerHTML.
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const link = (base: string, p: { id: string; title: string }) =>
  `<li><a class="underline" href="${base}/reports/posts/${esc(p.id)}?tab=body">${esc(p.title)}</a></li>`;

type StatsData = { editor: string; posts: { id: string; title: string }[] };

// The server `load` in `admin.ts` supplies `ctx.data`. The button loads it again.
export const mountStats: Mount<PageContext<StatsData>> = (el, ctx) => {
  const render = ({ data, integral }: PageContext<StatsData>) => {
    el.innerHTML = `<h1 class="text-2xl font-semibold">Stats for ${esc(data.editor)}</h1>
      <p class="mt-2 text-sm text-zinc-600">${data.posts.length} post(s)</p>
      <ul class="mt-4 flex flex-col gap-1 text-sm">${data.posts.map((p) => link(integral.base, p)).join("")}</ul>
      <button class="btn mt-4" type="button">Refresh</button>`;
    el.querySelector("button")!.onclick = () => integral.reload();
  };
  render(ctx);
  return { update: render, unmount: () => (el.innerHTML = "") };
};

// A string is HTML: escape untrusted values and prefix links with `integral.base`.
export const dashboardHeader: PageHeader = (crumbs, { integral }) =>
  `<div style="display:flex;align-items:center;gap:8px;font-size:14px">
    ${crumbs.map((c) => `<a class="underline" href="${integral.base}${esc(c.to)}">${esc(c.label)}</a>`).join(" / ")}
    <span style="border-radius:4px;padding:2px 8px;font-size:12px;background:#f59e0b33">Beta</span>
  </div>`;

export const mountDashboard: Mount<PageContext> = (el, { integral }) => {
  const render = async () => {
    const posts = await client.find("posts");
    const session = await client.getSession();
    el.style.height = "100%";
    el.innerHTML = `<div style="height: 100%; padding: 1.5rem;"><h1 class="text-2xl font-semibold">Hi, ${esc(session?.user.name ?? "Guest")}</h1>
      <p class="mt-2 text-sm text-zinc-600">${posts.length} post(s)</p>
      <ul class="mt-4 flex flex-col gap-1 text-sm">${posts.map((p) => link(integral.base, p)).join("")}</ul></div>`;
  };
  render();
  return () => (el.innerHTML = "");
};

// `update` runs on every route change, so the page refetches when `:id` or `?tab` changes.
export const mountPost: Mount<PageContext> = (el, ctx) => {
  const render = async ({ params, query }: PageContext) => {
    const post = await client.findById("posts", String(params.id));
    el.innerHTML = `<h1 class="text-2xl font-semibold">${esc(post.title)}</h1>
      <p class="mt-2 text-sm text-zinc-600">id ${esc(params.id)}, tab ${esc(query.tab ?? "none")}</p>
      ${query.tab === "body" ? `<pre class="mt-4 text-sm">${esc(post.body)}</pre>` : ""}`;
  };
  render(ctx);
  return { update: render, unmount: () => (el.innerHTML = "") };
};
