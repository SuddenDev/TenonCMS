import { beforeEach, expect, it } from "vitest";
import { createDb } from "../../create-db.ts";
import { migrate } from "../../migrations/migrate.ts";
import type { Db } from "../document-sql.ts";
import { claimInvite } from "./claim-invite.query.ts";
import { insertInvite } from "./insert-invite.query.ts";
import { inviteByEmail } from "./invite-by-email.query.ts";
import { inviteByToken } from "./invite-by-token.query.ts";
import { findInvites } from "./find-invites.query.ts";
import { renewInvite } from "./renew-invite.query.ts";
import { deleteInvite } from "./delete-invite.query.ts";

let db: Db;
const now = 1_000_000;
const invite = {
  id: "i1",
  email: "e@b.co",
  role: "editor",
  token_hash: "h1",
  invited_by: "u1",
  expires_at: now + 1000,
  created_at: now,
};

beforeEach(async () => {
  db = createDb({ url: ":memory:" });
  await migrate(db, { database: { db, type: "sqlite" } });
  await insertInvite(db, invite);
});

it("finds an unexpired invite by token hash", async () => {
  expect(await inviteByToken(db, "h1", now)).toEqual(invite);
  expect(await inviteByToken(db, "h1", now + 1000)).toBeUndefined();
  expect(await inviteByToken(db, "other", now)).toBeUndefined();
});

it("claims an invite once", async () => {
  expect(await claimInvite(db, "h1", now)).toEqual(invite);
  expect(await claimInvite(db, "h1", now)).toBeUndefined();
  expect(await findInvites(db)).toEqual([]);
});

it("does not claim an expired invite", async () => {
  expect(await claimInvite(db, "h1", now + 1000)).toBeUndefined();
  expect(await findInvites(db)).toEqual([invite]);
});

it("finds an invite by email, expired or not", async () => {
  expect(await inviteByEmail(db, "e@b.co")).toEqual(invite);
  expect(await inviteByEmail(db, "x@b.co")).toBeUndefined();
});

it("renews the token and expiry", async () => {
  const renewed = { ...invite, token_hash: "h2", expires_at: now + 5000 };
  expect(await renewInvite(db, "i1", "h2", now + 5000)).toEqual(renewed);
  expect(await inviteByToken(db, "h1", now)).toBeUndefined();
  expect(await inviteByToken(db, "h2", now)).toEqual(renewed);
  expect(await renewInvite(db, "missing", "h3", now)).toBeUndefined();
});

it("deletes an invite", async () => {
  expect(await deleteInvite(db, "i1")).toBe(true);
  expect(await deleteInvite(db, "i1")).toBe(false);
});

it("refuses a second invite for the same email", async () => {
  await expect(insertInvite(db, { ...invite, id: "i2", token_hash: "h9" })).rejects.toThrow();
});
