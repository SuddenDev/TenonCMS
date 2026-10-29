import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { checkSiteStyles } from "./check-site-styles.ts";
import { collectClientRefs } from "./collect-client-refs.ts";
import { relativeResolver, removeProjects, tempProject } from "./test-project.ts";

afterEach(removeProjects);

it.each(["css", "less", "sass", "scss", "styl", "stylus", "pcss", "postcss", "sss"])(
  "rejects injected %s styles and allows inline styles",
  async (extension) => {
    const root = await tempProject({});
    const file = join(root, `bar.${extension}`);
    await expect(checkSiteStyles([file], async () => null)).rejects.toThrow("eager CSS");
    await expect(checkSiteStyles([file + "?inline"], async () => null)).resolves.toBeUndefined();
    await expect(checkSiteStyles([file + "?raw"], async () => null)).resolves.toBeUndefined();
  },
);

it("rejects eager CSS while accepting inline CSS and lazy styled fields", async () => {
  const root = await tempProject({
    "tenon.config.ts": `import { clientRef } from 'tenoncms/admin'; export default { fields: { color: clientRef('./field.ts') }, adminBar: { items: clientRef('./bar.ts') } };`,
    "field.ts": `import './field.css'; export default () => {};`,
    "bar.ts": `import './bar.css'; export default [];`,
    "bar.css": ".bar{}",
  });
  const refs = await collectClientRefs(root, [join(root, "tenon.config.ts")], relativeResolver);
  expect(refs["./bar.ts"].site).toBe(true);
  await expect(checkSiteStyles([refs["./bar.ts"].file], relativeResolver)).rejects.toThrow(
    "eager CSS",
  );

  await writeFile(join(root, "bar.ts"), `import css from './bar.css?inline'; export default [];`);
  await expect(checkSiteStyles([refs["./bar.ts"].file], relativeResolver)).resolves.toBeUndefined();
});

it("follows imports of imports", async () => {
  const root = await tempProject({
    "bar.ts": `import './deep.ts';`,
    "deep.ts": `import './deep.css';`,
    "deep.css": ".a{}",
  });
  await expect(checkSiteStyles([join(root, "bar.ts")], relativeResolver)).rejects.toThrow(
    join(root, "deep.css"),
  );
});

it("does not follow leaves or imports that do not resolve", async () => {
  const root = await tempProject({
    "bar.ts": `import 'node:fs'; import 'tenoncms/admin'; import 'unknown-package'; import './data.json';`,
    "data.json": "{}",
  });
  await expect(checkSiteStyles([join(root, "bar.ts")], relativeResolver)).resolves.toBeUndefined();
});

it("rejects a Vue component with a style block", async () => {
  const root = await tempProject({
    "bar.ts": `import Badge from './Badge.vue'; export default Badge;`,
    "Badge.vue": `<script setup lang="ts"></script><template><p /></template><style>p { color: red }</style>`,
    "Plain.vue": `<script setup lang="ts"></script><template><p /></template>`,
  });
  await expect(checkSiteStyles([join(root, "bar.ts")], relativeResolver)).rejects.toThrow(
    "styled Vue component",
  );
  await expect(
    checkSiteStyles([join(root, "Plain.vue")], relativeResolver),
  ).resolves.toBeUndefined();
});

it("stops on import cycles", async () => {
  const root = await tempProject({
    "a.ts": `import './b.ts';`,
    "b.ts": `import './a.ts';`,
  });
  await expect(checkSiteStyles([join(root, "a.ts")], relativeResolver)).resolves.toBeUndefined();
});
