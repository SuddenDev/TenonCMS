import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchTemplates,
  mergePackageJson,
  readIndex,
  scaffold,
  toPackageName,
  toWorkerName,
} from "./scaffold.ts";

const giget = vi.hoisted(() => ({ downloadTemplate: vi.fn() }));
vi.mock("giget", () => giget);

const templates = resolve(import.meta.dirname, "../../../templates");
const project = () => join(mkdtempSync(join(tmpdir(), "create-tenoncms-")), "site");
const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

describe("scaffold", () => {
  it("names the site", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      siteName: 'My "Site"',
      framework: "astro",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    });
    expect(read(dir, "tenon.config.ts")).toContain(
      'site: { url: TENON_SITE_URL, name: "My \\"Site\\"" },',
    );
    expect(read(dir, "astro.config.ts")).toContain(
      'TENON_SITE_URL: envField.string({ context: "server", access: "secret", url: true, optional: true }),',
    );
  });

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
    expect(read(dir, "tenon.config.ts")).toContain("secret: TENON_SECRET,");
    expect(read(dir, "astro.config.ts")).toContain("adapter: cloudflare(),");
    expect(read(dir, ".dev.vars")).toMatch(/^TENON_SECRET=[0-9a-f]{64}$/m);
    expect(read(dir, ".dev.vars.example")).toMatch(/^# TENON_SITE_URL=$/m);
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

    const secret = read(dir, ".env").match(/^TENON_SECRET=(.*)$/m)?.[1];
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(read(dir, ".env.example")).toContain("change-me");
    expect(read(dir, ".env.example")).toMatch(/^# TENON_SITE_URL=$/m);
    expect(read(dir, ".env.example")).toMatch(/^S3_BUCKET=uploads$/m);
    expect(read(dir, ".env.example")).toMatch(/^# S3_PREFIX=$/m);
    expect(read(dir, "tenon.config.ts")).toContain("prefix: S3_PREFIX,");
    expect(read(dir, ".env.example")).toMatch(/^TENON_SECRET=.*\n\n(# .*\n)*# ?DATABASE_DIR=/m);
    expect(read(dir, "tenon.config.ts")).toContain('site: { url: TENON_SITE_URL, name: "Tenon" },');
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
    expect(nuxt).toContain('tenonSecret: "",');
    expect(nuxt).toContain('tenonSiteUrl: "",');
    expect(nuxt).toContain('databaseUrl: "file:./cms.db",');
    expect(nuxt).toContain('databaseAuthToken: "",');
    expect(nuxt).toContain('s3Bucket: "",');
    expect(nuxt).toContain('awsEndpointUrlS3: "",');

    const config = read(dir, "tenon.config.ts");
    expect(config).toContain("const config = useRuntimeConfig();");
    expect(config).toContain("secret: config.tenonSecret,");
    expect(config).toContain('site: { url: config.tenonSiteUrl || undefined, name: "Tenon" },');
    expect(config).toContain("url: config.databaseUrl,");
    expect(config).toContain("authToken: config.databaseAuthToken || undefined,");
    expect(config).toContain("bucket: config.s3Bucket,");
    expect(config).toContain("endpoint: config.awsEndpointUrlS3,");
    expect(config).toContain("prefix: config.s3Prefix || undefined,");

    const example = read(dir, ".env.example");
    expect(example).toMatch(/^# NUXT_DATABASE_URL=file:\.\/cms\.db$/m);
    expect(example).toMatch(/^# NUXT_DATABASE_AUTH_TOKEN=$/m);
    expect(example).toMatch(/^# NUXT_TENON_SITE_URL=$/m);
    expect(example).toMatch(/^NUXT_S3_BUCKET=uploads$/m);
    expect(example).toMatch(/^NUXT_AWS_ENDPOINT_URL_S3=/m);
    expect(read(dir, ".env")).toMatch(/^NUXT_TENON_SECRET=[0-9a-f]{64}$/m);
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
          expect(keys, combo).toContain("tenonSecret");
          for (const key of used) expect(keys, `${combo}: ${key}`).toContain(key);
          for (const key of keys) {
            const name = `NUXT_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
            expect(example, `${combo}: ${name}`).toMatch(new RegExp(`^(# )?${name}=`, "m"));
          }
          expect(example, combo).not.toMatch(/^(# )?(?!NUXT_)[A-Z_0-9]+=/m);
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

  it("writes the sign-in methods and adds the passkey package", async () => {
    const choices = {
      name: "a",
      framework: "tanstack",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    };
    const dir = project();
    await scaffold(templates, dir, { ...choices, auth: ["passkey", "magic-link"] });
    expect(read(dir, "tenon.config.ts")).toContain("emailAndPassword: { enabled: false },");
    expect(read(dir, "tenon.config.ts")).toContain("plugins: [passkey(), magicLink()],");
    expect(JSON.parse(read(dir, "package.json")).dependencies).toHaveProperty(
      "@better-auth/passkey",
    );

    const plain = project();
    await scaffold(templates, plain, choices);
    expect(read(plain, "tenon.config.ts")).not.toContain("auth:");
    expect(JSON.parse(read(plain, "package.json")).dependencies).not.toHaveProperty(
      "@better-auth/passkey",
    );
  });

  it("puts the image provider into the storage's media block", async () => {
    const choices = {
      name: "a",
      framework: "standalone",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    };
    const dir = project();
    await scaffold(templates, dir, { ...choices, images: "ipx" });
    expect(read(dir, "tenon.config.ts")).toContain(
      '  media: {\n    storage: local({ dir: ".uploads" }),\n    images: { provider: ipx({ prerender: true }) },\n  },\n',
    );
    expect(JSON.parse(read(dir, "package.json")).dependencies).toHaveProperty("ipx");

    const hosted = project();
    await scaffold(templates, hosted, { ...choices, images: "imgix" });
    expect(read(hosted, "tenon.config.ts")).toContain(
      "images: { provider: imgix({ baseURL: process.env.IMGIX_URL! }) },",
    );
    expect(read(hosted, ".env.example")).toMatch(/^IMGIX_URL=https:/m);
    expect(JSON.parse(read(hosted, "package.json")).dependencies).not.toHaveProperty("ipx");

    const plain = project();
    await scaffold(templates, plain, choices);
    expect(read(plain, "tenon.config.ts")).not.toContain("images:");
  });

  it("hands every method of the API to the CMS in TanStack Start", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "tanstack",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    });
    expect(read(dir, "src/routes/[_]tenon.$.ts")).toContain("handlers: { ANY: handle }");
  });

  it("adds the SMTP email adapter and its package only when chosen", async () => {
    const choices = {
      name: "a",
      framework: "standalone",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    };
    const dir = project();
    await scaffold(templates, dir, { ...choices, email: "smtp" });
    expect(read(dir, "tenon.config.ts")).toContain('import { smtp } from "tenoncms/email/smtp";');
    expect(read(dir, "tenon.config.ts")).toContain("adapter: smtp({");
    expect(read(dir, "tenon.config.ts")).toContain(
      'const smtpPort = Number(process.env.SMTP_PORT ?? "465");',
    );
    expect(read(dir, "tenon.config.ts")).toContain("secure: smtpPort === 465,");
    expect(read(dir, ".env.example")).toMatch(/^SMTP_HOST=/m);
    expect(read(dir, ".env.example")).toMatch(/^# SMTP_PORT=465$/m);
    expect(JSON.parse(read(dir, "package.json")).dependencies).toHaveProperty("nodemailer");

    const plain = project();
    await scaffold(templates, plain, choices);
    expect(read(plain, "tenon.config.ts")).not.toContain("email:");
    expect(JSON.parse(read(plain, "package.json")).dependencies).not.toHaveProperty("nodemailer");
  });

  it("uses R2 and Cloudflare Email Service with API keys outside Cloudflare", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "a",
      framework: "standalone",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "r2",
      email: "cloudflare",
    });
    const config = read(dir, "tenon.config.ts");
    expect(config).toContain("accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,");
    expect(config).toContain("accessKeyId: process.env.R2_ACCESS_KEY_ID!,");
    expect(config).toContain("prefix: process.env.R2_PREFIX,");
    expect(config).toContain("apiToken: process.env.CLOUDFLARE_EMAIL_API_TOKEN!,");
    expect(config).not.toContain("cloudflare:workers");
    const example = read(dir, ".env.example");
    expect(example.match(/^CLOUDFLARE_ACCOUNT_ID=/gm)).toHaveLength(1);
    expect(example).toMatch(/^R2_BUCKET=/m);
    expect(example).toMatch(/^# R2_PREFIX=$/m);
    expect(example).toMatch(/^CLOUDFLARE_EMAIL_API_TOKEN=/m);
    expect(existsSync(join(dir, "_emails"))).toBe(false);
  });

  it("reads the CMS origin from TENON_CMS_URL only in the standalone starter", async () => {
    const standalone = project();
    await scaffold(templates, standalone, {
      name: "a",
      framework: "standalone",
      template: "minimal",
      target: "vercel",
      database: "postgres",
      storage: "s3",
      auth: ["password", "passkey"],
    });
    expect(read(standalone, "tenon.config.ts")).toContain(
      "  auth: {\n    baseURL: process.env.TENON_CMS_URL,\n    plugins: [passkey()],\n  },\n",
    );
    expect(read(standalone, ".env.example")).toMatch(/^# TENON_CMS_URL=$/m);

    const astro = project();
    await scaffold(templates, astro, {
      name: "a",
      framework: "astro",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    });
    expect(read(astro, "tenon.config.ts")).not.toContain("TENON_CMS_URL");
    expect(read(astro, ".env.example")).not.toContain("TENON_CMS_URL");
  });

  it("adds the Cloudflare email adapter and its binding only when chosen", async () => {
    const choices = {
      name: "a",
      framework: "astro",
      template: "minimal",
      target: "cloudflare",
      database: "durable-object",
      storage: "r2",
    };
    const dir = project();
    await scaffold(templates, dir, { ...choices, email: "cloudflare" });
    const config = read(dir, "tenon.config.ts");
    expect(config).toContain('import { cloudflareEmail } from "tenoncms/email/cloudflare";');
    expect(config).toContain("adapter: cloudflareEmail(env.EMAIL),");
    expect(config).toContain("storage: r2(env.MEDIA),");
    expect(existsSync(join(dir, "_emails"))).toBe(false);
    expect(existsSync(join(dir, "_storages"))).toBe(false);
    expect(config.match(/from "cloudflare:workers"/g)).toHaveLength(1);
    expect(read(dir, ".dev.vars.example")).toMatch(/^EMAIL_FROM=/m);
    expect(read(dir, "wrangler.jsonc")).toContain('  "send_email": [{ "name": "EMAIL" }],\n}');

    const plain = project();
    await scaffold(templates, plain, choices);
    expect(read(plain, "tenon.config.ts")).not.toContain("email:");
    expect(read(plain, "wrangler.jsonc")).not.toMatch(/send_email|@tenon/);
  });

  it("adds @libsql/client only with the libSQL database", async () => {
    for (const framework of ["astro", "tanstack"]) {
      for (const database of ["libsql", "sqlite", "postgres", "pglite"]) {
        const dir = project();
        await scaffold(templates, dir, {
          name: "a",
          framework,
          template: "minimal",
          target: "node",
          database,
          storage: "local",
        });
        const { dependencies } = JSON.parse(read(dir, "package.json"));
        expect("@libsql/client" in dependencies, `${framework} with ${database}`).toBe(
          database === "libsql",
        );
      }
    }
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

  it("sets up Vercel's image optimization and turns the job cron off on Vercel", async () => {
    const configs = {
      astro: "astro.config.ts",
      nuxt: "nuxt.config.ts",
      tanstack: "vite.config.ts",
      standalone: "vite.config.ts",
    };
    for (const [framework, file] of Object.entries(configs)) {
      const dir = project();
      await scaffold(templates, dir, {
        name: "a",
        framework,
        template: "minimal",
        target: "vercel",
        database: "postgres",
        storage: "s3",
        images: "vercel",
      });
      const config = read(dir, file);
      expect(config).toContain("sizes: [320, 640, 1024, 1536, 1920], domains: []");
      // Astro has no Nitro cron on Vercel.
      if (framework !== "astro") expect(config).toContain("jobs: false");
    }

    const node = project();
    await scaffold(templates, node, {
      name: "a",
      framework: "nuxt",
      template: "minimal",
      target: "node",
      database: "libsql",
      storage: "local",
    });
    expect(read(node, "nuxt.config.ts")).not.toMatch(/@tenon|vercel|jobs/);
  });

  it("names the Worker and its bucket after the project and turns Astro sessions off on Cloudflare", async () => {
    const dir = project();
    await scaffold(templates, dir, {
      name: "my_site.v2",
      framework: "astro",
      template: "minimal",
      target: "cloudflare",
      database: "durable-object",
      storage: "r2",
    });
    const wrangler = read(dir, "wrangler.jsonc");
    expect(wrangler).toContain('"name": "my-site-v2",');
    expect(wrangler).toContain('"bucket_name": "my-site-v2-media",');
    expect(wrangler).not.toContain("tenon-site");
    expect(read(dir, "astro.config.ts")).toContain("session: false,");
  });

  it("lists only what each framework supports", async () => {
    const index = await readIndex(templates);
    expect(index.frameworks.nuxt!.targets).not.toContain("cloudflare");
    for (const target of Object.values(index.targets))
      for (const id of [...target.databases, ...target.storages])
        expect(index.databases[id] ?? index.storages[id]).toBeDefined();
    for (const target of Object.values(index.targets))
      for (const id of target.emails) expect(index.emails[id]).toBeDefined();
    expect(index.templates.minimal!.frameworks).toContain("standalone");
  });
});

describe("fetchTemplates", () => {
  const zlibError = () =>
    Object.assign(new Error("zlib: unexpected end of file"), { name: "ZlibError" });

  it("downloads again after a broken tarball, which another scaffold can cause in giget's shared cache", async () => {
    giget.downloadTemplate.mockReset();
    giget.downloadTemplate
      .mockRejectedValueOnce(zlibError())
      .mockResolvedValueOnce({ dir: "/tmp/templates" });
    await expect(fetchTemplates("gh:owner/repo/templates")).resolves.toBe("/tmp/templates");
    expect(giget.downloadTemplate).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 broken tarballs, and at once on any other error", async () => {
    giget.downloadTemplate.mockReset();
    giget.downloadTemplate.mockRejectedValue(zlibError());
    await expect(fetchTemplates("gh:owner/repo/templates")).rejects.toThrow("zlib");
    expect(giget.downloadTemplate).toHaveBeenCalledTimes(3);

    giget.downloadTemplate.mockReset();
    giget.downloadTemplate.mockRejectedValue(new Error("Failed to download"));
    await expect(fetchTemplates("gh:owner/repo/templates")).rejects.toThrow("Failed to download");
    expect(giget.downloadTemplate).toHaveBeenCalledTimes(1);
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

  it("turns a package name into a Worker name that leaves room for `-media`", () => {
    expect(toWorkerName("my_site~2")).toBe("my-site-2");
    expect(toWorkerName("a".repeat(70))).toBe("a".repeat(57));
    expect(toWorkerName("___")).toBe("tenon-site");
  });
});
