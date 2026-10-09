import type { Mount, PageContext } from "../../admin/index.d.ts";
import { CmsError, createClient } from "../../client/index.ts";
import css from "./admin.css?raw";
import type { Redirect } from "./index.ts";

const client = createClient();

export const mountTools: Mount<PageContext> = (el, { integral }) => {
  addStyles();
  el.innerHTML = page;
  const lookup = form(el, "lookup");
  const importer = form(el, "import");
  lookup.onsubmit = (e) => {
    e.preventDefault();
    void showLookup(lookup);
  };
  importer.onsubmit = (e) => {
    e.preventDefault();
    void runImport(importer, integral.base);
  };
  return () => {
    el.innerHTML = "";
  };
};

// `.input` and `.btn` are the admin's shared classes. Everything else comes from admin.css.
const page = `
  <section class="redirects-tools">
    <h1>Redirect tools</h1>
    <form name="lookup">
      <label>
        Test a path
        <span class="row">
          <input class="input" name="path" placeholder="/old-page" required />
          <button class="btn" type="submit">Look up</button>
        </span>
      </label>
      <output></output>
    </form>
    <form name="import">
      <label>
        Import
        <textarea class="input" name="rows" rows="6" required></textarea>
      </label>
      <p>One redirect per line: <code>/from /to</code>. Start a line with <code>302</code> for a temporary redirect.</p>
      <span class="row"><button class="btn" type="submit">Import</button></span>
      <output></output>
    </form>
  </section>`;

async function showLookup(form: HTMLFormElement) {
  const path = field(form, "path").value;
  const out = output(form);
  try {
    const redirect = await client.request<Redirect>("/redirects/lookup", { query: { path } });
    out.innerHTML = `${esc(path)} → <a href="${esc(redirect.to)}">${esc(redirect.to)}</a> (${redirect.status})`;
  } catch (e) {
    out.textContent = e instanceof CmsError && e.status === 404 ? "No redirect" : errorMessage(e);
  }
}

async function runImport(form: HTMLFormElement, base: string) {
  const rows = parseRows(field(form, "rows").value);
  const out = output(form);
  try {
    const { count } = await client.request<{ count: number }>("/redirects/import", {
      method: "POST",
      body: rows,
    });
    out.innerHTML = `Imported ${count}. <a href="${base}/content/collections/redirects">View redirects</a>`;
  } catch (e) {
    out.textContent = errorMessage(e);
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
function errorMessage(e: unknown) {
  if (!(e instanceof CmsError)) return "Request failed";
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
