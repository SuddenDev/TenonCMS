import { expect, it } from "vitest";
import { rows } from "./status";

const user = {
  id: "u1",
  name: "Ada",
  email: "ada@b.co",
  role: "admin",
  banned: false,
  createdAt: "2026-10-01T00:00:00.000Z",
};
const invite = {
  id: "i1",
  email: "ed@b.co",
  role: "editor",
  invitedBy: "u1",
  expiresAt: "2026-10-31T00:00:00.000Z",
  createdAt: "2026-10-24T00:00:00.000Z",
  expired: false,
};

it("lists users first, then invites, each with a status", () => {
  expect(
    rows(
      [user, { ...user, id: "u2", banned: true }],
      [invite, { ...invite, id: "i2", expired: true }],
    ),
  ).toEqual([
    {
      kind: "user",
      id: "u1",
      name: "Ada",
      email: "ada@b.co",
      role: "admin",
      status: "active",
      date: user.createdAt,
    },
    {
      kind: "user",
      id: "u2",
      name: "Ada",
      email: "ada@b.co",
      role: "admin",
      status: "deactivated",
      date: user.createdAt,
    },
    {
      kind: "invite",
      id: "i1",
      name: "",
      email: "ed@b.co",
      role: "editor",
      status: "invited",
      date: invite.createdAt,
    },
    {
      kind: "invite",
      id: "i2",
      name: "",
      email: "ed@b.co",
      role: "editor",
      status: "expired",
      date: invite.createdAt,
    },
  ]);
});

it("treats a user without a role as an editor", () => {
  expect(rows([{ ...user, role: null }], [])[0].role).toBe("editor");
});
