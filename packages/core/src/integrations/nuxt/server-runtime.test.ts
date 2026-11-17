import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { expect, it } from "vitest";

const server = fileURLToPath(new URL("./runtime/server/", import.meta.url));

// Nitro 2 does not transpile files under `node_modules`, so an installed tenoncms ships these to Rollup as they are.
it.each(await readdir(server))(
  "keeps runtime/server/%s free of TypeScript syntax",
  async (file) => {
    const code = await readFile(server + file, "utf8");
    expect(() => parseAst(code)).not.toThrow();
  },
);
