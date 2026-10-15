import type { PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { useEffect, useState } from "react";
import { stars } from "../utils/stars.ts";
import { texts } from "../utils/texts.ts";
import type { Quote as QuoteDoc } from "../../types.ts";
import { Divider } from "./Divider.tsx";
import "./tailwind.css";

const client = createClient();

/** The quote of the `:id` route param, with a back and an edit link. Refetches when the param changes. */
export function Quote({ params, integral }: PageContext) {
  const [quote, setQuote] = useState<QuoteDoc>();
  const t = texts(integral.locale);
  useEffect(() => {
    client.findById("quotes", String(params.id)).then(setQuote);
  }, [params.id]);
  return (
    <div className="ex:mx-auto ex:my-5 ex:max-w-200">
      <p className="ex:flex ex:justify-between ex:gap-2">
        <a className="btn" href={`${integral.base}/quote-stats`}>
          {t("back")}
        </a>
        {quote && (
          <a className="btn" href={`${integral.base}/content/collections/quotes/${quote.id}`}>
            {t("edit")}
          </a>
        )}
      </p>
      {quote && (
        <>
          <Divider />
          <blockquote className="ex:text-2xl">“{quote.text}”</blockquote>
          <p className="ex:mt-2 ex:opacity-70">{quote.author}</p>
          <p className="ex:mt-2 ex:tracking-widest ex:text-amber-500">{stars(quote.rating)}</p>
        </>
      )}
    </div>
  );
}
