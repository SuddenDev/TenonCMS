import { type Mount, type PageContext, translator } from "integral-cms/admin";
import { CmsError, createClient } from "integral-cms/client";
import css from "./admin.css?raw";
import type { Redirect } from "./index.ts";
import de from "./locales/de.json";
import en from "./locales/en.json";

const client = createClient();

type T = ReturnType<typeof translator>;

// A switch of the admin language renders the page again.
export const mountTools: Mount<PageContext> = (el, ctx) => {
  addStyles();
  let locale = ctx.integral.locale;
  const render = () => {
    const t = translator({ en, de }, locale);
    el.innerHTML = page(t);
    const lookup = form(el, "lookup");
    const importer = form(el, "import");
    lookup.onsubmit = (e) => {
      e.preventDefault();
      void showLookup(lookup, t);
    };
    importer.onsubmit = (e) => {
      e.preventDefault();
      void runImport(importer, ctx.integral.base, t);
    };
  };
  render();
  return {
    update(next) {
      if (next.integral.locale === locale) return;
      locale = next.integral.locale;
      render();
    },
    unmount: () => {
      el.innerHTML = "";
    },
  };
};

// `.input` and `.btn` are the admin's shared classes. Everything else comes from admin.css.
const page = (t: T) => `
  <section class="redirects-tools">
    <h1>${t("title")}</h1>
    <form name="lookup">
      <label>
        ${t("test")}
        <span class="row">
          <input class="input" name="path" placeholder="/old-page" required />
          <button class="btn" type="submit">${t("lookUp")}</button>
        </span>
      </label>
      <output></output>
    </form>
    <form name="import">
      <label>
        ${t("import")}
        <textarea class="input" name="rows" rows="6" required></textarea>
      </label>
      <p>${t("hint", { format: "<code>/from /to</code>", temporary: "<code>302</code>" })}</p>
      <span class="row"><button class="btn" type="submit">${t("import")}</button></span>
      <output></output>
    </form>
  </section>`;

async function showLookup(form: HTMLFormElement, t: T) {
  const path = field(form, "path").value;
  const out = output(form);
  try {
    const redirect = await client.request<Redirect>("/redirects/lookup", { query: { path } });
    out.innerHTML = `${esc(path)} → <a href="${esc(redirect.to)}">${esc(redirect.to)}</a> (${redirect.status})`;
  } catch (e) {
    out.textContent = e instanceof CmsError && e.status === 404 ? t("none") : errorMessage(e, t);
  }
}

async function runImport(form: HTMLFormElement, base: string, t: T) {
  const rows = parseRows(field(form, "rows").value);
  const out = output(form);
  try {
    const { count } = await client.request<{ count: number }>("/redirects/import", {
      method: "POST",
      body: rows,
    });
    out.innerHTML = `${t("imported", { count })} <a href="${base}/content/collections/redirects">${t("view")}</a>`;
  } catch (e) {
    out.textContent = errorMessage(e, t);
  }
}

/** One redirect per line, `/from /to`. A line that starts with `302` is temporary. Other lines are skipped. */
export function parseRows(text: string) {
  return text.split("\n").flatMap((line) => {
    const parts = line.trim().split(/\s+/);
    const permanent = parts[0] !== "302";
    const [from, to] = permanent ? parts : parts.slice(1);
    return from && to ? [{ from, to, permanent }] : [];
  });
}

// The field messages of a 400, else the response message.
function errorMessage(e: unknown, t: T) {
  if (!(e instanceof CmsError)) return t("failed");
  const fields = Object.values<string>(e.body?.errors ?? {});
  return fields.length ? fields.join(", ") : e.message;
}

function addStyles() {
  if (document.querySelector("style[data-plugin=redirects]")) return;
  const style = document.createElement("style");
  style.dataset.plugin = "redirects";
  style.textContent = css;
  document.head.append(style);
}

const form = (el: HTMLElement, name: string) =>
  el.querySelector<HTMLFormElement>(`form[name="${name}"]`)!;
const field = (form: HTMLFormElement, name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
const output = (form: HTMLFormElement) => form.querySelector("output")!;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
