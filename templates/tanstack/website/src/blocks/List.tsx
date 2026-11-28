import type { BlockProps } from "./types";

export function List({ block, edit }: BlockProps<"list">) {
  return (
    <section className="wrap split">
      <div className="split-head">
        <h2 data-cms={edit("title")}>{block.title}</h2>
        {block.intro && <p data-cms={edit("intro")}>{block.intro}</p>}
      </div>
      <ul className="rows">
        {block.items?.map((item, i) => (
          <li key={item.id}>
            <strong data-cms={edit(`items.${i}.title`)}>{item.title}</strong>
            <span data-cms={edit(`items.${i}.text`)}>{item.text}</span>
            <code data-cms={edit(`items.${i}.note`)}>{item.note}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
