import { expect, it } from "vitest";
import { hashToken, newToken } from "./token.ts";

it("makes a different URL-safe token each time", () => {
  const a = newToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newToken()).not.toBe(a);
});

it("hashes a token to stable SHA-256 hex", async () => {
  expect(await hashToken("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
