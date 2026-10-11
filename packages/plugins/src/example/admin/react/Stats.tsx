import { useState } from "react";
import type { PageContext } from "integral-cms/admin";
import { API_BASE } from "integral-cms/client";
import type { Stats as StatsData } from "../../types.ts";
import { stars } from "../utils/stars.ts";
import { Divider } from "./Divider.tsx";
import "./tailwind.css";

const getRandomQuote = async () => {
  const response = await fetch(`${API_BASE}/example/random`, { method: "GET" });
  alert(
    response.ok
      ? `Random Quote from public route (see network tab)\n\n ${await response.text()}`
      : "Failed to fetch random quote",
  );
};

/** The stats page from its `load` data, with a rating chart and some links. */
export function Stats({ data, integral }: PageContext<StatsData>) {
  const max = Math.max(1, ...data.ratings);
  // The rating whose bar was clicked; clicking it again clears the filter.
  const [rating, setRating] = useState<number>();
  const shown = rating ? data.quotes.filter((q) => q.rating === String(rating)) : data.quotes;
  return (
    <div className="mx-auto my-5 max-w-200">
      <p className="mb-4 flex justify-end gap-2">
        <button className="btn" type="button" onClick={() => integral.reload()}>
          Refresh
        </button>
        <button className="btn" type="button" onClick={getRandomQuote}>
          Random Quote (from api)
        </button>
        <a className="btn" href={`${API_BASE}/example/quotes.csv`} download>
          Download CSV
        </a>
      </p>
      <Divider />
      <p>
        {data.count} quotes, {data.changes} changes since the server started.
      </p>
      <Divider />
      <h2 className="mt-4 font-semibold">Ratings</h2>
      <ul className="mt-2 flex flex-col-reverse gap-1">
        {data.ratings.map((count, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={rating === i + 1}
              onClick={() => setRating(rating === i + 1 ? undefined : i + 1)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-neutral-500/10 ${
                rating === i + 1 ? "bg-amber-500/15" : rating ? "opacity-50" : ""
              }`}
            >
              <span className="w-8 text-sm">{i + 1}★</span>
              <span className="h-4 flex-1 rounded bg-neutral-500/15">
                <span
                  className="block h-full rounded bg-amber-500"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right text-sm">{count}</span>
            </button>
          </li>
        ))}
      </ul>
      <Divider />
      <h2 className="mt-4 font-semibold">Quotes{rating && ` rated ${rating}★`}</h2>
      {!shown.length && <p>No quotes.</p>}
      <ul className="mt-2">
        {shown.map((quote) => (
          <li
            key={quote.id}
            className="flex items-baseline gap-3 border-b border-neutral-500/15 py-1.5"
          >
            <a
              className="min-w-0 flex-1 truncate underline"
              href={`${integral.base}/example/quotes/${quote.id}`}
            >
              {quote.text}
            </a>
            <span className="text-sm opacity-70">{quote.author}</span>
            <span className="tracking-widest text-amber-500">{stars(quote.rating)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
