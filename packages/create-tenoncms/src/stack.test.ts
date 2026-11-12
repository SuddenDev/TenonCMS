import { describe, expect, it } from "vitest";
import { envExample, fillMarkers, type Part } from "./stack.ts";

const config = `import { defineCms } from "tenoncms";
// @tenon-imports

export default defineCms({
  // @tenon-options
  collections: {},
});
`;

const parts: Part[] = [
  {
    files: {
      "tenon.config.ts": {
        imports: ['import { libsql } from "tenoncms/libsql";'],
        options: ["database: libsql({ url: $DATABASE_URL, authToken: $DATABASE_AUTH_TOKEN }),"],
      },
    },
    env: [
      { name: "DATABASE_URL", comment: "A file.", default: "file:./cms.db" },
      { name: "DATABASE_AUTH_TOKEN", optional: true },
    ],
  },
  {
    files: {
      "tenon.config.ts": { options: ["media: {", "  storage: s3({ bucket: $S3_BUCKET }),", "},"] },
    },
    env: [{ name: "S3_BUCKET", example: "uploads" }],
  },
];

describe("fillMarkers", () => {
  it("reads process.env, with the default or a non-null assertion", () => {
    const text = fillMarkers(config, "tenon.config.ts", parts);
    expect(text).toContain('import { libsql } from "tenoncms/libsql";\n\nexport default');
    expect(text).toContain(
      '  database: libsql({ url: process.env.DATABASE_URL ?? "file:./cms.db", authToken: process.env.DATABASE_AUTH_TOKEN }),\n',
    );
    expect(text).toContain(
      "  media: {\n    storage: s3({ bucket: process.env.S3_BUCKET! }),\n  },\n",
    );
    expect(text).not.toContain("@tenon-");
  });

  it("imports the variables it uses from the env module", () => {
    const text = fillMarkers(config, "tenon.config.ts", parts, "astro:env/server");
    expect(text).toContain(
      'import { DATABASE_AUTH_TOKEN, DATABASE_URL, S3_BUCKET } from "astro:env/server";',
    );
    expect(text).toContain("url: DATABASE_URL,");
  });

  it("puts setup code after the imports", () => {
    const text = fillMarkers(config, "tenon.config.ts", [
      {
        files: {
          "tenon.config.ts": {
            imports: ["import a;"],
            setup: ["const db = a();"],
            options: ["db,"],
          },
        },
      },
    ]);
    expect(text).toContain("import a;\n\nconst db = a();\n\nexport default");
  });

  it("writes the Astro env schema", () => {
    const astro = "env: {\n  schema: {\n    // @tenon-env\n  },\n},";
    const text = fillMarkers(astro, "astro.config.ts", parts);
    expect(text).toContain(
      '    DATABASE_URL: envField.string({ context: "server", access: "secret", default: "file:./cms.db" }),',
    );
    expect(text).toContain(
      '    DATABASE_AUTH_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),',
    );
  });

  it("rejects a variable no part declares", () => {
    const bad: Part = { files: { "tenon.config.ts": { options: ["x: $NOPE,"] } } };
    expect(() => fillMarkers(config, "tenon.config.ts", [bad])).toThrow(/NOPE/);
  });
});

describe("envExample", () => {
  it("lists required variables, and defaults and optional ones commented out", () => {
    expect(envExample(parts)).toBe(
      "# A file.\n# DATABASE_URL=file:./cms.db\n# DATABASE_AUTH_TOKEN=\nS3_BUCKET=uploads\n",
    );
  });
});
