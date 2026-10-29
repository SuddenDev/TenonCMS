import type { Fields, Layout } from "../index.ts";

/**
 * Checks the admin layout of a set of fields and of every group, array item and block inside it.
 * @param where Path of the owner in messages, e.g. `posts` or `posts.seo`.
 * @throws {Error} For a `tab` or `fieldset` the nearest owner does not define, or a fieldset whose fields do not share
 * their tabs.
 */
export function checkLayout(fields: Fields, layout: Layout, where: string) {
  const tabsOf = new Map<string, string>();
  for (const [key, f] of Object.entries(fields)) {
    const at = `${where}.${key}`;
    for (const tab of f.tab === undefined ? [] : [f.tab].flat())
      if (!layout.tabs || !Object.hasOwn(layout.tabs, tab))
        fail(`field "${at}" names unknown tab "${tab}"`);
    if (f.fieldset !== undefined) {
      if (!layout.fieldsets || !Object.hasOwn(layout.fieldsets, f.fieldset))
        fail(`field "${at}" names unknown fieldset "${f.fieldset}"`);
      const tabs = JSON.stringify([f.tab ?? []].flat().sort());
      if ((tabsOf.get(f.fieldset) ?? tabs) !== tabs)
        fail(`fieldset "${where}.${f.fieldset}" holds fields of different tabs`);
      tabsOf.set(f.fieldset, tabs);
    }
    if (f.type === "group" || f.type === "array") checkLayout(f.fields, f, at);
    if (f.type === "blocks")
      for (const [name, b] of Object.entries(f.blocks)) checkLayout(b.fields, b, `${at}.${name}`);
  }
}

function fail(message: string): never {
  throw new Error(`tenoncms: ${message}`);
}
