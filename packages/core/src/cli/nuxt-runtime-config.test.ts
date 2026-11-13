import { describe, expect, it } from "vitest";
import { applyEnv } from "./nuxt-runtime-config.ts";

describe("applyEnv", () => {
  it("reads NITRO_ before NUXT_, nested keys in snake case", () => {
    const config = { cmsSecret: "", databaseUrl: "file:./cms.db", public: { apiBase: "" } };
    applyEnv(config, {
      NUXT_CMS_SECRET: "secret",
      NITRO_DATABASE_URL: "libsql://a",
      NUXT_DATABASE_URL: "libsql://b",
      NUXT_PUBLIC_API_BASE: "/api",
    });
    expect(config).toEqual({
      cmsSecret: "secret",
      databaseUrl: "libsql://a",
      public: { apiBase: "/api" },
    });
  });

  it("keeps a value without a variable and parses JSON values", () => {
    const config = { uploadsDir: ".uploads", retries: 1, flag: false };
    applyEnv(config, { NUXT_RETRIES: "3", NUXT_FLAG: "true" });
    expect(config).toEqual({ uploadsDir: ".uploads", retries: 3, flag: true });
  });

  it("merges an object value into the nested config", () => {
    const config = { s3: { bucket: "a", region: "eu" } };
    applyEnv(config, { NUXT_S3: '{"bucket":"b"}', NUXT_S3_REGION: "us" });
    expect(config).toEqual({ s3: { bucket: "b", region: "us" } });
  });
});
