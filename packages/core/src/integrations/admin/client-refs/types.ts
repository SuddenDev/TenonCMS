import type { parseAst } from "vite";

/** Resolves an import `id` seen in `importer` to an absolute file, or `null` when it cannot be followed. */
export type Resolver = (id: string, importer: string) => Promise<string | null>;

/** A `clientRef()` target after resolution: the module file and the export that the admin loads. */
export type ClientRef = {
  file: string;
  export: string;
  /**
   * `true` when the reference is reachable from `adminBar`. The admin bar runs on the host's own pages, so its
   * module graph MUST NOT pull in styles.
   */
  site?: boolean;
};

/** What a local name imports: the `exported` name of `source`, `"default"` or `"*"` for a namespace. */
export type Binding = { source: string; exported: string };

/** The parsed module. */
export type Program = ReturnType<typeof parseAst>;

/** An ESTree node. The parser's node types are not exported, so nodes are read by shape. */
export type AstNode = any;
