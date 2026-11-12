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
    expect(pkg.devDependencies).toMatchObject({ "@tenoncms/cli": "^1.2.3" });
    expect(pkg.scripts).toMatchObject({ dev: "astro dev", deploy: expect.any(String) });
    expect(read(dir, "tenon.config.ts")).toContain("database: durableObject(),");
    expect(read(dir, "tenon.config.ts")).toContain("secret: CMS_SECRET,");
    expect(read(dir, "astro.config.ts")).toContain("adapter: cloudflare(),");
    expect(read(dir, ".dev.vars")).toMatch(/^CMS_SECRET=[0-9a-f]{64}$/m);
    expect(read(dir, ".gitignore")).toMatch(/^\.wrangler$/m);
    expect(read(dir, ".gitignore")).toMatch(/^\.astro$/m);
    expect(existsSync(join(dir, "part.json"))).toBe(false);
    expect(existsSync(join(dir, ".env"))).toBe(false);
  });

  it("writes each env example with a new secret", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "nuxt",
      template: "minimal",
      target: "node",
      database: "pglite",
      storage: "s3",
      tenonVersion: "1.0.0",
    });

    const secret = read(dir, ".env").match(/^CMS_SECRET=(.*)$/m)?.[1];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(read(dir, ".env.example")).toContain("change-me");
    expect(read(dir, ".env.example")).toContain("S3_BUCKET=uploads");
    expect(read(dir, "tenon.config.ts")).toContain("new PGlite(process.env.DATABASE_DIR");
    expect(JSON.parse(read(dir, "package.json")).dependencies).toHaveProperty(
      "@electric-sql/pglite",
    );
    expect(read(dir, ".gitignore")).toMatch(/^\.pglite$/m);
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
