import type { Mount, PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { stars } from "../utils/stars.ts";
import { esc } from "../utils/esc.ts";
import { addStyles } from "./styles.ts";

const client = createClient();

/** Fetches the quote of the `:id` route param and shows it with a back and an edit link. Refetches on route changes. */
export const mountQuote: Mount<PageContext> = (el, ctx) => {
  addStyles();
  const render = async ({ params, integral }: PageContext) => {
    const quote = await client.findById("quotes", String(params.id));
    el.innerHTML = `
      <div class="example-page">
        <p class="links between">
          <a class="btn" href="${integral.base}/quote-stats">← Quote stats</a>
          <a class="btn" href="${integral.base}/content/collections/quotes/${esc(quote.id)}">Edit</a>
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
