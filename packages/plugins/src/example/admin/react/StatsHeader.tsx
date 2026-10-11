import type { PageContext } from "integral-cms/admin";
import type { Stats } from "../../types.ts";
import "./tailwind.css";

/** The title, plus the quote count linked to the quotes list. */
export function StatsHeader({ data, integral }: PageContext<Stats>) {
  return (
    <div className="flex size-full items-center justify-center">
      Quote stats&nbsp;&bull;&nbsp;
      <a className="underline" href={`${integral.base}/content/collections/quotes`}>
        {data.count} quotes
      </a>
    </div>
  );
}
