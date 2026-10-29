import { expect, it, vi } from "vitest";
import { resolveImport } from "./resolve-import.ts";

it.each([
  "node:fs",
  "tenoncms",
  "tenoncms/admin",
  "tenoncms/admin/bar",
  "tenoncms/client",
  "tenoncms/preview",
  "tenoncms/media/local",
])("does not follow %s", async (id) => {
  const resolver = vi.fn(async () => "/found.ts");
  expect(await resolveImport(resolver, id, "/importer.ts")).toBeNull();
  expect(resolver).not.toHaveBeenCalled();
});

it.each(["./local.ts", "my-plugin/admin", "tenoncms-extra", "tenoncms/plugins/redirects"])(
  "resolves %s through the resolver",
  async (id) => {
    const resolver = vi.fn(async () => "/found.ts");
    expect(await resolveImport(resolver, id, "/importer.ts")).toBe("/found.ts");
    expect(resolver).toHaveBeenCalledWith(id, "/importer.ts");
  },
);

it("returns null for an import that does not resolve", async () => {
  expect(await resolveImport(async () => null, "unknown", "/importer.ts")).toBeNull();
});
