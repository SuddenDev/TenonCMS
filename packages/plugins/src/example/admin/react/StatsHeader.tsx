import type { PageContext } from "tenoncms/admin";
import type { Stats } from "../../types.ts";
import { texts } from "../utils/texts.ts";
import "./tailwind.css";

/** The title, plus the quote count linked to the quotes list. */
export function StatsHeader({ data, tenon }: PageContext<Stats>) {
  const t = texts(tenon.locale);
  return (
    <div className="ex:flex ex:size-full ex:items-center ex:justify-center">
      {t("title")}&nbsp;&bull;&nbsp;
      <a className="ex:underline" href={`${tenon.base}/content/collections/quotes`}>
        {t("count", { n: data.count })}
      </a>
    </div>
  );
}
