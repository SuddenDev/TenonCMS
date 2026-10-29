// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { edit, excludedSelector, patch, pickBound } from "./bind-elements.ts";
import { setDraft } from "./store.ts";

describe("edit", () => {
  it("joins collection, id and path", () => {
    expect(edit("pages", "abc", "seo.title")).toBe("pages:abc:seo.title");
  });

  it("leaves the id empty for a global", () => {
    expect(edit("general", null, "title")).toBe("general::title");
  });
});

describe("excluded entries", () => {
  const bound = (binding: string) => {
    const el = document.createElement("p");
    el.setAttribute("data-cms", binding);
    return el;
  };

  it("match the bindings of an excluded collection or global, not a global of the same name", () => {
    const selector = excludedSelector({ collections: ["comments"], globals: ["footer"] })!;
    expect(bound("comments:9:body").matches(selector)).toBe(true);
    expect(bound("footer::copyright").matches(selector)).toBe(true);
    expect(bound("comments::title").matches(selector)).toBe(false);
    expect(bound("footer:1:title").matches(selector)).toBe(false);
    expect(bound("commentsx:9:body").matches(selector)).toBe(false);
    expect(excludedSelector({ collections: [], globals: [] })).toBeNull();
  });

  it("let a click pick the closest bound element that is not excluded", () => {
    document.body.innerHTML = `<article data-cms="posts:1:body"><p data-cms="comments:9:body"><b>Hi</b></p></article><p data-cms="comments:8:body">Alone</p>`;
    const selector = excludedSelector({ collections: ["comments"], globals: [] });
    expect(pickBound(document.querySelector("b")!, selector)).toBe(
      document.querySelector("article"),
    );
    expect(pickBound(document.querySelector("[data-cms='comments:8:body']")!, selector)).toBeNull();
    expect(pickBound(document.querySelector("b")!, null)).toBe(
      document.querySelector("b")!.parentElement,
    );
  });
});

describe("patch", () => {
  const bound = (binding: string, text: string) => {
    const el = document.createElement("p");
    el.setAttribute("data-cms", binding);
    el.textContent = text;
    return el;
  };

  it("writes a field of a populated relation", () => {
    setDraft("posts", "1", { author: { id: "a1", name: "Ann" } });
    const el = bound("posts:1:author.name", "Old");
    patch(el);
    expect(el.textContent).toBe("Ann");
  });

  it("leaves text bound to a populated relation as it is", () => {
    setDraft("posts", "1", { author: { id: "a1", name: "Ann" } });
    const el = bound("posts:1:author", "By Ann");
    patch(el);
    expect(el.textContent).toBe("By Ann");
  });
});
