import { boundDocuments } from "./bind-elements.ts";

// `API_BASE` of the client. Importing it would pull core code into the browser entry.
const API = "/api/cms";
const COOKIE = "integral-preview";
const BAR_STYLE =
  "[data-cms-bar]{all:initial;position:fixed;inset:0 0 auto;height:32px;z-index:2147483647;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 8px;background:rgb(24 24 27/.92);backdrop-filter:blur(8px);border-bottom:1px solid rgb(255 255 255/.08);color:#e4e4e7;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}" +
  "[data-cms-bar] *{box-sizing:border-box}" +
  "[data-cms-bar] :is(a,button,label){all:unset;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:6px;cursor:pointer;white-space:nowrap;color:inherit}" +
  "[data-cms-bar] :is(a,button,label):hover{background:rgb(255 255 255/.08);color:#fff}" +
  "[data-cms-bar] :is(a,button,label):focus-visible{outline:2px solid #3b82f6;outline-offset:-2px}" +
  "[data-cms-bar] a:first-child{font-weight:600;color:#fff}" +
  "[data-cms-bar] input{all:unset;width:24px;height:14px;border-radius:7px;background:#52525b;position:relative;transition:background .15s}" +
  "[data-cms-bar] input::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:transform .15s}" +
  "[data-cms-bar] input:checked{background:#3b82f6}[data-cms-bar] input:checked::after{transform:translateX(10px)}" +
  "[data-cms-bar] [data-end]{margin-left:auto;display:flex;padding:2px;gap:2px;border-radius:8px;background:rgb(255 255 255/.06)}" +
  "[data-cms-bar] [data-end] button{height:20px}" +
  "[data-cms-bar] [data-end] button::before{content:'';width:6px;height:6px;border-radius:50%;background:#10b981}" +
  "[data-cms-bar] [data-end] button:first-child::before{background:#f59e0b}" +
  "[data-cms-bar] [aria-pressed=true]{background:rgb(255 255 255/.14);color:#fff}" +
  "[data-cms-bar] [data-end]~button{margin-left:4px}" +
  "@media (prefers-reduced-motion:reduce){[data-cms-bar] *{transition:none!important}}";
const perspective = () =>
  document.cookie.split(";").some((c) => c.trim() === `${COOKIE}=drafts`) ? "drafts" : "published";

async function setPerspective(value: string) {
  await fetch(`${API}/preview`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ perspective: value }),
  });
  location.reload();
}

// One "Edit" link per document or global bound on the page.
function editLinks(admin: string) {
  return boundDocuments().map(({ collection, id }) => {
    const a = document.createElement("a");
    a.textContent = `Edit ${collection}`;
    a.href = `${admin}/presentation/${id ? `collections/${collection}/${id}` : `globals/${collection}`}`;
    return a;
  });
}

/**
 * The bar at the top of the page. `preview` (a preview tab): an edit switch, the perspective and "Exit preview".
 * `admin` (a signed-in user on the site): a link to the admin, one edit link per bound document and the perspective.
 * Returns the function that removes it.
 */
export function bar(kind: "preview" | "admin", admin: string) {
  const html = document.documentElement;
  const root = document.createElement("div");
  root.setAttribute("data-cms-bar", "");
  const style = document.createElement("style");
  style.textContent = BAR_STYLE;
  const button = (text: string, onclick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = onclick;
    return b;
  };

  const links = document.createElement("span");
  links.style.display = "contents";
  const scan = () => links.replaceChildren(...editLinks(admin));
  if (kind === "admin") {
    const home = document.createElement("a");
    home.textContent = "Admin";
    home.href = admin;
    scan();
    root.append(home, links);
  } else {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.checked = html.hasAttribute("data-cms-edit");
    input.onchange = () => html.toggleAttribute("data-cms-edit", input.checked);
    label.append(input, "Edit");
    root.append(label);
  }

  const toggle = document.createElement("span");
  toggle.setAttribute("data-end", "");
  toggle.style.display = "flex";
  const current = perspective();
  for (const [value, text] of [
    ["drafts", "Drafts"],
    ["published", "Published"],
  ] as const) {
    const b = button(text, () => value !== current && void setPerspective(value));
    b.setAttribute("aria-pressed", String(value === current));
    toggle.append(b);
  }
  root.append(toggle);
  if (kind === "preview")
    root.append(
      button("Exit preview", () => {
        window.name = "";
        location.reload();
      }),
    );

  // Outside `<body>`, so a morph or a framework render does not remove it.
  html.append(style, root);
  const margin = html.style.marginTop;
  html.style.marginTop = "32px";
  document.addEventListener("DOMContentLoaded", scan);
  return () => {
    root.remove();
    style.remove();
    html.style.marginTop = margin;
    document.removeEventListener("DOMContentLoaded", scan);
  };
}
