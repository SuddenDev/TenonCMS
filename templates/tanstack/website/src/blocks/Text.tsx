import { Richtext } from "tenoncms/react";
import type { BlockProps } from "./types";

export function Text({ block, edit }: BlockProps<"text">) {
  return (
    <section className="wrap">
      <div className="split text">
        <h2 data-cms={edit("title")}>{block.title}</h2>
        <Richtext content={block.body} className="prose" data-cms={edit("body")} />
      </div>
    </section>
  );
}
