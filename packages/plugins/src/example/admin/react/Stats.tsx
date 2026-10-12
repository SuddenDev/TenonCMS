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
    <div className="ex:mx-auto ex:my-5 ex:max-w-200">
      <p className="ex:mb-4 ex:flex ex:justify-end ex:gap-2">
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
      <h2 className="ex:mt-4 ex:font-semibold">Ratings</h2>
      <ul className="ex:mt-2 ex:flex ex:flex-col-reverse ex:gap-1">
        {data.ratings.map((count, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={rating === i + 1}
              onClick={() => setRating(rating === i + 1 ? undefined : i + 1)}
              className={`ex:flex ex:w-full ex:cursor-pointer ex:items-center ex:gap-2 ex:rounded ex:px-1 ex:py-0.5 ex:text-left ex:hover:bg-neutral-500/10 ${
                rating === i + 1 ? "ex:bg-amber-500/15" : rating ? "ex:opacity-50" : ""
              }`}
            >
              <span className="ex:w-8 ex:text-sm">{i + 1}★</span>
              <span className="ex:h-4 ex:flex-1 ex:rounded ex:bg-neutral-500/15">
                <span
                  className="ex:block ex:h-full ex:rounded ex:bg-amber-500"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="ex:w-8 ex:text-right ex:text-sm">{count}</span>
            </button>
          </li>
        ))}
      </ul>
      <Divider />
      <h2 className="ex:mt-4 ex:font-semibold">Quotes{rating && ` rated ${rating}★`}</h2>
      {!shown.length && <p>No quotes.</p>}
      <ul className="ex:mt-2">
        {shown.map((quote) => (
          <li
            key={quote.id}
            className="ex:flex ex:items-baseline ex:gap-3 ex:border-b ex:border-neutral-500/15 ex:py-1.5"
          >
            <a
              className="ex:min-w-0 ex:flex-1 ex:truncate ex:underline"
              href={`${integral.base}/example/quotes/${quote.id}`}
            >
              {quote.text}
            </a>
            <span className="ex:text-sm ex:opacity-70">{quote.author}</span>
            <span className="ex:tracking-widest ex:text-amber-500">{stars(quote.rating)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
