import { Link } from "tenoncms/react";
import type { BlockProps } from "./types";

export function Hero({ block, edit }: BlockProps<"hero">) {
  return (
    <section className="wrap hero">
      <h1 data-cms={edit("title")}>{block.title}</h1>
      {block.intro && (
        <p className="intro" data-cms={edit("intro")}>
          {block.intro}
        </p>
      )}
      {block.links?.length ? (
        <div className="actions">
          {block.links.map((item, i) => (
            <Link
              key={item.id}
              link={item.link}
              className={i === 0 ? "button" : undefined}
              data-cms={edit(`links.${i}.label`)}
            >
              {item.label || item.link?.title}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
