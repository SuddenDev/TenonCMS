import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergePackageJson, readIndex, scaffold, toPackageName } from "./scaffold.ts";

const templates = resolve(import.meta.dirname, "../../../templates");
const project = () => join(mkdtempSync(join(tmpdir(), "create-tenoncms-")), "site");
const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

describe("scaffold", () => {
  it("layers the template, the shared target and the framework's target", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "my-site",
      framework: "astro",
      template: "minimal",
      target: "cloudflare",
      database: "durable-object",
      storage: "r2",
      tenonVersion: "1.2.3",
    });

    const pkg = JSON.parse(read(dir, "package.json"));
    expect(pkg.name).toBe("my-site");
    expect(pkg.dependencies).toMatchObject({
      tenoncms: "^1.2.3",
      "@astrojs/cloudflare": expect.any(String),
    });
    expect(pkg.scripts).toMatchObject({ dev: "astro dev", deploy: expect.any(String) });
    expect(read(dir, "tenon.config.ts")).toContain("database: durableObject(),");
    expect(read(dir, "tenon.config.ts")).toContain("secret: CMS_SECRET,");
    expect(read(dir, "astro.config.ts")).toContain("adapter: cloudflare(),");
    expect(read(dir, ".dev.vars")).toMatch(/^CMS_SECRET=[0-9a-f]{64}$/m);
    expect(read(dir, ".dev.vars.example")).toContain("# TENON_BASE_URL=https://cms.example.com");
    expect(read(dir, ".gitignore")).toMatch(/^\.wrangler$/m);
    expect(read(dir, ".gitignore")).toMatch(/^\.astro$/m);
    expect(existsSync(join(dir, "part.json"))).toBe(false);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  });

  it("writes each env example with a new secret", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "astro",
      template: "minimal",
      target: "node",
      database: "pglite",
      storage: "s3",
      tenonVersion: "1.0.0",
    });

    const secret = read(dir, ".env").match(/^CMS_SECRET=(.*)$/m)?.[1];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(read(dir, ".env.example")).toContain("change-me");
    expect(read(dir, ".env.example")).toContain("# TENON_BASE_URL=https://cms.example.com");
    expect(read(dir, ".env.example")).toMatch(/^S3_BUCKET=uploads$/m);
    expect(read(dir, "tenon.config.ts")).toContain("new PGlite(DATABASE_DIR)");
    expect(read(dir, "astro.config.ts")).toContain("DATABASE_DIR: envField.string(");
    expect(JSON.parse(read(dir, "package.json")).dependencies).toHaveProperty(
      "@electric-sql/pglite",
    );
    expect(read(dir, ".gitignore")).toMatch(/^\.pglite$/m);
  });

  it("reads Nuxt's runtimeConfig, set by NUXT_ variables", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "nuxt",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "s3",
    });

    const nuxt = read(dir, "nuxt.config.ts");
    expect(nuxt).toContain('cmsSecret: "",');
    expect(nuxt).toContain('databaseUrl: "file:./cms.db",');
    expect(nuxt).toContain('databaseAuthToken: "",');
    expect(nuxt).toContain('s3Bucket: "",');
    expect(nuxt).toContain('awsEndpointUrlS3: "",');

    const config = read(dir, "tenon.config.ts");
    expect(config).toContain("const config = useRuntimeConfig();");
    expect(config).toContain("secret: config.cmsSecret,");
    expect(config).toContain("url: config.databaseUrl,");
    expect(config).toContain("authToken: config.databaseAuthToken || undefined,");
    expect(config).toContain("bucket: config.s3Bucket,");
    expect(config).toContain("endpoint: config.awsEndpointUrlS3,");

    const example = read(dir, ".env.example");
    expect(example).toMatch(/^# NUXT_DATABASE_URL=file:\.\/cms\.db$/m);
    expect(example).toMatch(/^# NUXT_DATABASE_AUTH_TOKEN=$/m);
    expect(example).toContain("# TENON_BASE_URL=https://cms.example.com");
    expect(example).not.toContain("NUXT_TENON_BASE_URL");
    expect(example).toMatch(/^NUXT_S3_BUCKET=uploads$/m);
    expect(example).toMatch(/^NUXT_AWS_ENDPOINT_URL_S3=/m);
    expect(read(dir, ".env")).toMatch(/^NUXT_CMS_SECRET=[0-9a-f]{64}$/m);
  });

  it("declares every runtimeConfig key that a Nuxt starter reads, with its NUXT_ variable", async () => {
    const index = await readIndex(templates);
    for (const target of index.frameworks.nuxt!.targets)
      for (const database of index.targets[target]!.databases)
        for (const storage of index.targets[target]!.storages) {
          const dir = project();
          const choices = { name: "a", framework: "nuxt", template: "minimal", target };
          await scaffold(templates, dir, { ...choices, database, storage });
          const combo = `${target}/${database}/${storage}`;

          const config = read(dir, "tenon.config.ts");
          const nuxt = read(dir, "nuxt.config.ts");
          const example = read(dir, ".env.example");
          const keys = [...nuxt.matchAll(/^ {4}(\w+): ".*",$/gm)].map((m) => m[1]!);
          const used = [...config.matchAll(/\bconfig\.(\w+)/g)].map((m) => m[1]!);

          expect(config, combo).not.toContain("process.env");
          expect(config + nuxt, combo).not.toContain("@tenon-");
          expect(keys, combo).toContain("cmsSecret");
          for (const key of used) expect(keys, `${combo}: ${key}`).toContain(key);
          for (const key of keys) {
            const name = `NUXT_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
            expect(example, `${combo}: ${name}`).toMatch(new RegExp(`^(# )?${name}=`, "m"));
          }
          expect(example, combo).not.toMatch(/^(# )?(?!NUXT_|TENON_BASE_URL=)[A-Z_0-9]+=/m);
        }
  });

  it("approves the dependency builds the layers need, for pnpm", async () => {
    const dir = project();
    const choices = {
      name: "a",
      framework: "astro",
      template: "minimal",
      target: "cloudflare",
      database: "durable-object",
      storage: "r2",
    };
    await scaffold(templates, dir, { ...choices, pm: "pnpm" });
    expect(read(dir, "pnpm-workspace.yaml")).toMatch(
      /^allowBuilds:\n {2}esbuild: true\n {2}workerd: true\n$/m,
    );

    const npm = project();
    await scaffold(templates, npm, { ...choices, pm: "npm" });
    expect(existsSync(join(npm, "pnpm-workspace.yaml"))).toBe(false);
  });

  it("takes the target's own version of a database", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "standalone",
      template: "minimal",
      target: "vercel",
      database: "postgres",
      storage: "s3",
    });

    expect(read(dir, "tenon.config.ts")).toContain("attachDatabasePool(database.pool);");
    expect(existsSync(join(dir, "_databases"))).toBe(false);
  });

  it("lists only what each framework supports", async () => {
    const index = await readIndex(templates);
    expect(index.frameworks.nuxt!.targets).not.toContain("cloudflare");
    for (const target of Object.values(index.targets))
      for (const id of [...target.databases, ...target.storages])
        expect(index.databases[id] ?? index.storages[id]).toBeDefined();
    expect(index.templates.minimal!.frameworks).toContain("standalone");
  });
});

describe("package.json", () => {
  it("merges scripts and dependencies, the later file winning", () => {
    expect(
      mergePackageJson(
        { name: "a", scripts: { dev: "x" }, dependencies: { b: "1", a: "1" } },
        { scripts: { start: "y" }, dependencies: { a: "2" } },
      ),
    ).toEqual({ name: "a", scripts: { dev: "x", start: "y" }, dependencies: { a: "2", b: "1" } });
  });

  it("turns a folder name into a package name", () => {
    expect(toPackageName("My Site!")).toBe("my-site");
    expect(toPackageName(".hidden")).toBe("hidden");
  });
});
