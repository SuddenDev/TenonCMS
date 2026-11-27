import { describe, expect, it } from "vitest";
import { authPart, envExample, fillMarkers, requireAuthMethods, type Part } from "./stack.ts";

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

  it("groups the media lines of every part into one block, where the first one is", () => {
    const text = fillMarkers(config, "tenon.config.ts", [
      { files: { "tenon.config.ts": { options: ["secret: 1,"] } } },
      { files: { "tenon.config.ts": { media: ["storage: local(),"] } } },
      { files: { "tenon.config.ts": { options: ["site: 2,"] } } },
      { files: { "tenon.config.ts": { media: ["images: {", "  provider: ipx(),", "},"] } } },
    ]);
    expect(text).toContain(
      "  secret: 1,\n  media: {\n    storage: local(),\n    images: {\n      provider: ipx(),\n    },\n  },\n  site: 2,\n",
    );
  });

  it("imports the variables it uses from the env module", () => {
    const text = fillMarkers(config, "tenon.config.ts", parts, { envModule: "astro:env/server" });
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

  it("reads Nuxt's useRuntimeConfig()", () => {
    const text = fillMarkers(config, "tenon.config.ts", parts, { runtimeConfig: true });
    expect(text).toContain("\n\nconst config = useRuntimeConfig();\n\nexport default");
    expect(text).toContain(
      "url: config.databaseUrl, authToken: config.databaseAuthToken || undefined",
    );
    expect(text).toContain("bucket: config.s3Bucket");
  });

  it("writes Nuxt's runtimeConfig, with the defaults", () => {
    const nuxt = "runtimeConfig: {\n  // @tenon-runtime-config\n},";
    expect(fillMarkers(nuxt, "nuxt.config.ts", parts, { runtimeConfig: true })).toBe(
      'runtimeConfig: {\n  databaseUrl: "file:./cms.db",\n  databaseAuthToken: "",\n  s3Bucket: "",\n},',
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
      "# A file.\n# DATABASE_URL=file:./cms.db\n# DATABASE_AUTH_TOKEN=\n\nS3_BUCKET=uploads\n",
    );
  });

  it("prefixes the names for Nuxt", () => {
    expect(envExample(parts, "NUXT_")).toBe(
      "# A file.\n# NUXT_DATABASE_URL=file:./cms.db\n# NUXT_DATABASE_AUTH_TOKEN=\n\nNUXT_S3_BUCKET=uploads\n",
    );
  });
});

describe("authPart", () => {
  const filled = (part: Part) => fillMarkers(config, "tenon.config.ts", [part]);

  it("writes nothing for password alone", () => {
    expect(filled(authPart(["password"]))).not.toContain("auth");
  });

  it("turns password off and adds a plugin per method", () => {
    const text = filled(authPart(["passkey", "magic-link", "email-otp"]));
    expect(text).toContain('import { passkey } from "@better-auth/passkey";');
    expect(text).toContain('import { emailOTP, magicLink } from "tenoncms/auth";');
    expect(text).toContain(
      "  auth: {\n    emailAndPassword: { enabled: false },\n    plugins: [passkey(), magicLink(), emailOTP()],\n  },\n",
    );
  });

  it("reads the CMS origin for a headless CMS, also with password alone", () => {
    const part = authPart(["password"], { headless: true });
    expect(filled(part)).toContain("  auth: {\n    baseURL: process.env.TENON_CMS_URL,\n  },\n");
    expect(part.env).toEqual([
      expect.objectContaining({ name: "TENON_CMS_URL", optional: true, url: true }),
    ]);
  });

  it("keeps password on when it is picked", () => {
    const text = filled(authPart(["password", "email-otp"]));
    expect(text).not.toContain("emailAndPassword");
    expect(text).toContain('import { emailOTP } from "tenoncms/auth";');
    expect(text).toContain("plugins: [emailOTP()],");
  });
});

describe("requireAuthMethods", () => {
  it("reads a comma list", () => {
    expect(requireAuthMethods("passkey, magic-link")).toEqual(["passkey", "magic-link"]);
  });

  it("rejects an unknown method and an empty list", () => {
    expect(() => requireAuthMethods("password,sms")).toThrow(/sms/);
    expect(() => requireAuthMethods(" , ")).toThrow();
  });
});
