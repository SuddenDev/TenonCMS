import type { Mount, PageContext } from "integral-cms/admin";
import { API_BASE } from "integral-cms/client";
import { stars } from "../utils/stars.ts";
import type { Stats } from "../../types.ts";
import { esc } from "../utils/esc.ts";
import { addStyles } from "./styles.ts";

/** Renders the stats page from its `load` data, with a rating chart and some links. */
export const mountStats: Mount<PageContext<Stats>> = (el, ctx) => {
  addStyles();
  // The rating whose bar was clicked; clicking it again clears the filter.
  let rating: number | undefined;
  const render = (page: PageContext<Stats>) => {
    const { data, integral } = page;
    const max = Math.max(1, ...data.ratings);
    const rows = data.ratings
      .map(
        (count, i) => `
          <li>
            <button type="button" data-rating="${i + 1}" aria-pressed="${rating === i + 1}">
              <span class="label">${i + 1}★</span>
              <span class="track"><span class="bar" style="width:${(count / max) * 100}%"></span></span>
              <span class="value">${count}</span>
            </button>
          </li>`,
      )
      .join("");
    const shown = rating ? data.quotes.filter((q) => q.rating === String(rating)) : data.quotes;
    const quotes = shown
      .map(
        (q) => `
          <li>
            <a href="${integral.base}/example/quotes/${esc(q.id)}">${esc(q.text)}</a>
            <span class="meta">${esc(q.author)}</span>
            <span class="stars">${stars(q.rating)}</span>
          </li>`,
      )
      .join("");
    el.innerHTML = `
      <div class="example-page">
        <p class="links">
          <button class="btn" type="button" data-action="reload">Refresh</button>
          <button class="btn" type="button" data-action="random">Random Quote (from api)</button>
          <a class="btn" href="${API_BASE}/example/quotes.csv" download>Download CSV</a>
        </p>
        <hr />
        <p>${data.count} quotes, ${data.changes} changes since the server started.</p>
        <hr />
        <h2>Ratings</h2>
        <ul class="chart"${rating ? " data-filtered" : ""}>${rows}</ul>
        <hr />
        <h2>Quotes${rating ? ` rated ${rating}★` : ""}</h2>
        ${shown.length ? "" : "<p>No quotes.</p>"}
        <ul class="quotes">${quotes}</ul>
      </div>`;
    for (const button of el.querySelectorAll<HTMLElement>("[data-rating]")) {
      button.onclick = () => {
        const n = Number(button.dataset.rating);
        rating = rating === n ? undefined : n;
        render(page);
        el.querySelector<HTMLElement>(`[data-rating="${n}"]`)!.focus();
      };
    }
    el.querySelector<HTMLElement>("[data-action=reload]")!.onclick = () => integral.reload();
    el.querySelector<HTMLElement>("[data-action=random]")!.onclick = async () => {
      const response = await fetch(`${API_BASE}/example/random`, { method: "GET" });
      alert(
        response.ok
          ? `Random Quote from public route (see network tab)\n\n ${await response.text()}`
          : "Failed to fetch random quote",
      );
    };
  };
  render(ctx);
  return { update: render, unmount: () => (el.innerHTML = "") };
};
