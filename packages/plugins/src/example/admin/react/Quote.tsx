import type { PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { useEffect, useState } from "react";
import { stars } from "../utils/stars.ts";
import type { Quote as QuoteDoc } from "../../types.ts";
import { Divider } from "./Divider.tsx";
import "./tailwind.css";

const client = createClient();

/** The quote of the `:id` route param, with a back and an edit link. Refetches when the param changes. */
export function Quote({ params, integral }: PageContext) {
  const [quote, setQuote] = useState<QuoteDoc>();
  useEffect(() => {
    client.findById("quotes", String(params.id)).then(setQuote);
  }, [params.id]);
  return (
    <div className="mx-auto my-5 max-w-200">
      <p className="flex justify-between gap-2">
        <a className="btn" href={`${integral.base}/quote-stats`}>
          ← Quote stats
        </a>
        {quote && (
          <a className="btn" href={`${integral.base}/content/collections/quotes/${quote.id}`}>
            Edit
          </a>
        )}
      </p>
      {quote && (
        <>
          <Divider />
          <blockquote className="text-2xl">“{quote.text}”</blockquote>
          <p className="mt-2 opacity-70">{quote.author}</p>
          <p className="mt-2 tracking-widest text-amber-500">{stars(quote.rating)}</p>
        </>
      )}
    </div>
  );
}
