import type { Field, Fields, Layout } from "@/shared/api";

/** A run of fields shown together: the fields of one fieldset, one group or list on its own, or loose fields. */
export type Section = { fieldset?: string; container?: boolean; fields: [string, Field][] };

/**
 * Arranges fields by their `tab` and `fieldset`. Joins are left out.
 * @param split Gives each group, array and blocks field outside a fieldset its own section, with space around it.
 * @returns The sections of the fields without a tab, and those of each tab in the order of `tabs`.
 */
export function layout(fields: Fields, owner: Layout, split = false) {
  const entries = Object.entries(fields).filter(([, f]) => f.type !== "join");
  return {
    head: sections(
      entries.filter(([, f]) => f.tab === undefined),
      split,
    ),
    tabs: Object.keys(owner.tabs ?? {}).map((key) => ({
      key,
      sections: sections(
        entries.filter(([, f]) => [f.tab ?? []].flat().includes(key)),
        split,
      ),
    })),
  };
}

// A fieldset's section sits where its first field is. Loose fields next to each other share a section.
function sections(entries: [string, Field][], split: boolean) {
  const out: Section[] = [];
  const boxes = new Map<string, Section>();
  for (const entry of entries) {
    const [, field] = entry;
    const last = out.at(-1);
    if (field.fieldset !== undefined) {
      const box = boxes.get(field.fieldset);
      if (box) box.fields.push(entry);
      else {
        const section = { fieldset: field.fieldset, fields: [entry] };
        boxes.set(field.fieldset, section);
        out.push(section);
      }
    } else if (split && ["group", "array", "blocks"].includes(field.type))
      out.push({ container: true, fields: [entry] });
    else if (last && !last.fieldset && !last.container) last.fields.push(entry);
    else out.push({ fields: [entry] });
  }
  return out;
}
