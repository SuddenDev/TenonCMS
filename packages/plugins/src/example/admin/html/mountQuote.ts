import type { Mount, PageContext } from "tenoncms/admin";
import { createClient } from "tenoncms/client";
import { stars } from "../utils/stars.ts";
import { esc } from "../utils/esc.ts";
import { texts } from "../utils/texts.ts";
import { addStyles } from "./styles.ts";

const client = createClient();

/** Fetches the quote of the `:id` route param and shows it with a back and an edit link. Refetches on route changes. */
export const mountQuote: Mount<PageContext> = (el, ctx) => {
  addStyles();
  const render = async ({ params, tenon }: PageContext) => {
    const quote = await client.findById("quotes", String(params.id));
    const t = texts(tenon.locale);
    el.innerHTML = `
      <div class="example-page">
        <p class="links between">
          <a class="btn" href="${tenon.base}/quote-stats">${t("back")}</a>
          <a class="btn" href="${tenon.base}/content/collections/quotes/${esc(quote.id)}">${t("edit")}</a>
        </p>
        <hr />
        <blockquote>“${esc(quote.text)}”</blockquote>
        <p class="meta">${esc(quote.author)}</p>
        <p class="stars">${stars(quote.rating)}</p>
      </div>`;
  };
  void render(ctx);
  return { update: (next) => void render(next), unmount: () => (el.innerHTML = "") };
};
