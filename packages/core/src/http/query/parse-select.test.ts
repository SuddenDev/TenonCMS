import { describe, expect, it } from "vitest";
import { parseSelect } from "./parse-select.ts";

describe("parseSelect", () => {
  it("builds nested objects from dot paths, longer path wins", () => {
    expect(parseSelect("title,path,parent.title,parent.path")).toEqual({
      title: true,
      path: true,
      parent: { title: true, path: true },
    });
    expect(parseSelect("seo,seo.title")).toEqual({ seo: { title: true } });
    expect(parseSelect("seo.title,seo")).toEqual({ seo: { title: true } });
    expect(parseSelect("a.b.c")).toEqual({ a: { b: { c: true } } });
    expect(parseSelect("")).toEqual({});
    expect(parseSelect("title,,path")).toEqual({ title: true, path: true });
  });

  it("reads paths into array items like group paths", () => {
    expect(parseSelect("links.label,links.page.title")).toEqual({
      links: { label: true, page: { title: true } },
    });
  });

  it("reads paths into blocks by block name", () => {
    expect(parseSelect("content.hero.title,content.text")).toEqual({
      content: { hero: { title: true }, text: true },
    });
  });

  it("never writes to Object.prototype", () => {
    const select = parseSelect("__proto__.polluted,constructor.prototype.polluted");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(select).sort()).toEqual(["__proto__", "constructor"]);
  });
});
